"""Persistent auth state. Each transaction owns its connection (no shared commits)."""

import hashlib
import hmac
import json
import os
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

import jwt
from fastapi import HTTPException

from security.config import AuthSettings
from security.passwords import Passwords

TOKEN_SECONDS = 30 * 60
LOGIN_ERROR = "Unable to sign in with these credentials"
PUBLIC_FIELDS = ("id", "email", "name", "status", "role", "created_at")


def now() -> int:
    return int(time.time())


def public_user(row) -> dict:
    return {key: row[key] for key in PUBLIC_FIELDS}


class AuthService:
    def __init__(self, db_path: str, settings: AuthSettings):
        fd = os.open(db_path, os.O_CREAT | os.O_RDWR, 0o600)
        os.close(fd)
        os.chmod(db_path, 0o600)
        self.db_path = db_path
        self.settings = settings
        self.passwords = Passwords()
        with self.connect() as db:
            db.executescript(Path(__file__).with_name("schema.sql").read_text())

    @contextmanager
    def connect(self, write=False):
        db = sqlite3.connect(self.db_path, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA busy_timeout=10000")
        try:
            if write:
                db.execute("BEGIN IMMEDIATE")
            yield db
            if write:
                db.commit()
        except BaseException:
            if write:
                db.rollback()
            raise
        finally:
            db.close()

    def fingerprint(self, scope: str, value: str) -> str:
        return hmac.new(
            self.settings.signing_key, f"{scope}:{value}".encode(), hashlib.sha256
        ).hexdigest()

    def consume_limit(self, key: str, maximum: int, seconds: int) -> bool:
        with self.connect(write=True) as db:
            db.execute("DELETE FROM auth_limits WHERE expires_at <= ?", (now(),))
            row = db.execute(
                "SELECT count FROM auth_limits WHERE key=?", (key,)
            ).fetchone()
            if row and row["count"] >= maximum:
                return False
            db.execute(
                "INSERT INTO auth_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
                (key, now() + seconds),
            )
            return True

    def audit(self, db, actor, target, action, before, after):
        db.execute(
            "INSERT INTO auth_audit(actor_id,target_id,action,before_state,after_state,created_at) VALUES(?,?,?,?,?,?)",
            (actor, target, action, json.dumps(before), json.dumps(after), now()),
        )

    def seed(self, email: str, name: str, password: str) -> dict:
        hashed = self.passwords.hash(password)
        with self.connect(write=True) as db:
            if (
                db.execute("SELECT 1 FROM auth_bootstrap").fetchone()
                or db.execute("SELECT 1 FROM auth_users").fetchone()
            ):
                raise ValueError("Bootstrap already consumed or users already exist")
            ident = str(uuid.uuid4())
            db.execute(
                "INSERT INTO auth_users VALUES(?,?,?,?,?,?,?)",
                (ident, email, name, hashed, "active", "sysadmin", now()),
            )
            db.execute("INSERT INTO auth_bootstrap VALUES(1,?)", (now(),))
            self.audit(
                db,
                None,
                ident,
                "bootstrap",
                {},
                {"status": "active", "role": "sysadmin"},
            )
            return public_user(
                db.execute("SELECT * FROM auth_users WHERE id=?", (ident,)).fetchone()
            )

    def signup(self, email, name, password, ip):
        if not self.consume_limit(self.fingerprint("signup-ip", ip), 10, 900):
            raise HTTPException(
                429, "Too many signup requests", headers={"Retry-After": "900"}
            )
        hashed = self.passwords.hash(password)
        with self.connect(write=True) as db:
            admins = db.execute(
                "SELECT email FROM auth_users WHERE role='sysadmin' AND status='active'"
            ).fetchall()
            if not admins:
                raise HTTPException(503, "Account registration is not configured")
            if db.execute(
                "SELECT 1 FROM auth_users WHERE email=?", (email,)
            ).fetchone():
                return  # Same 202 response; never disclose an existing account's status.
            ident = str(uuid.uuid4())
            db.execute(
                "INSERT INTO auth_users VALUES(?,?,?,?,?,?,?)",
                (ident, email, name, hashed, "pending", None, now()),
            )
            self.audit(
                db, None, ident, "signup", {}, {"status": "pending", "role": None}
            )
            for admin in admins:
                db.execute(
                    "INSERT INTO auth_outbox(recipient,applicant_email,applicant_name,created_at) VALUES(?,?,?,?)",
                    (admin["email"], email, name, now()),
                )

    def login(self, email, password, ip):
        # Reserve attempts BEFORE hashing; concurrent requests cannot bypass the cap.
        if not self.consume_limit(self.fingerprint("login-ip", ip), 30, 900):
            raise HTTPException(
                401, LOGIN_ERROR, headers={"WWW-Authenticate": "Bearer"}
            )
        account_key = self.fingerprint("login-account", email)
        if not self.consume_limit(account_key, 5, 900):
            raise HTTPException(
                401, LOGIN_ERROR, headers={"WWW-Authenticate": "Bearer"}
            )
        with self.connect() as db:
            user = db.execute(
                "SELECT * FROM auth_users WHERE email=?", (email,)
            ).fetchone()
        valid = self.passwords.verify(user["password_hash"] if user else None, password)
        if not valid or user["status"] != "active":
            raise HTTPException(
                401, LOGIN_ERROR, headers={"WWW-Authenticate": "Bearer"}
            )
        replacement = (
            self.passwords.hash(password)
            if self.passwords.needs_rehash(user["password_hash"])
            else None
        )
        with self.connect(write=True) as db:
            fresh = db.execute(
                "SELECT * FROM auth_users WHERE id=?", (user["id"],)
            ).fetchone()
            if (
                not fresh
                or fresh["status"] != "active"
                or fresh["password_hash"] != user["password_hash"]
            ):
                raise HTTPException(401, LOGIN_ERROR)
            if replacement:
                db.execute(
                    "UPDATE auth_users SET password_hash=? WHERE id=?",
                    (replacement, user["id"]),
                )
            db.execute("DELETE FROM auth_limits WHERE key=?", (account_key,))
            db.execute("DELETE FROM auth_denylist WHERE expires_at<=?", (now(),))
            issued = now()
            claims = {
                "sub": user["id"],
                "iat": issued,
                "exp": issued + TOKEN_SECONDS,
                "jti": str(uuid.uuid4()),
                "iss": self.settings.issuer,
                "aud": self.settings.audience,
            }
            token = jwt.encode(
                claims,
                self.settings.signing_key,
                algorithm="HS256",
                headers={"typ": "at+jwt"},
            )
            return {
                "access_token": token,
                "token_type": "bearer",
                "expires_in": TOKEN_SECONDS,
                "user": public_user(fresh),
            }  # nosec B105: bearer is a protocol name, not a credential

    def authenticate(self, token: str, db=None):
        error = HTTPException(
            401, "Invalid or expired session", headers={"WWW-Authenticate": "Bearer"}
        )
        try:
            if len(token) > 4096:
                raise ValueError("oversized")
            header = jwt.get_unverified_header(token)
            if header != {"alg": "HS256", "typ": "at+jwt"}:
                raise ValueError("unexpected header")
            claims = jwt.decode(
                token,
                self.settings.signing_key,
                algorithms=["HS256"],
                issuer=self.settings.issuer,
                audience=self.settings.audience,
                options={
                    "require": ["sub", "exp", "iat", "jti", "iss", "aud"],
                    "strict_aud": True,
                },
                leeway=0,
            )
            if type(claims["exp"]) is not int or type(claims["iat"]) is not int:
                raise ValueError("invalid dates")
            if (
                claims["exp"] - claims["iat"] != TOKEN_SECONDS
                or claims["exp"] <= now()
                or claims["iat"] > now()
            ):
                raise ValueError("invalid lifetime")
            uuid.UUID(claims["sub"])
            uuid.UUID(claims["jti"])
        except (jwt.InvalidTokenError, ValueError, TypeError, AttributeError) as exc:
            raise error from exc

        def lookup(conn):
            if conn.execute(
                "SELECT 1 FROM auth_denylist WHERE jti=? AND expires_at>?",
                (claims["jti"], now()),
            ).fetchone():
                raise error
            user = conn.execute(
                "SELECT * FROM auth_users WHERE id=?", (claims["sub"],)
            ).fetchone()
            if (
                not user
                or user["status"] != "active"
                or user["role"] not in ("worker", "sysadmin")
            ):
                raise error
            return {"user": public_user(user), "claims": claims, "token": token}

        if db is not None:
            return lookup(db)
        with self.connect() as conn:
            return lookup(conn)

    def logout(self, token):
        with self.connect(write=True) as db:
            principal = self.authenticate(token, db)
            claims = principal["claims"]
            db.execute("DELETE FROM auth_denylist WHERE expires_at<=?", (now(),))
            # Expiry is the original exp: TTL = exp - now, never another 30 minutes.
            db.execute(
                "INSERT OR IGNORE INTO auth_denylist VALUES(?,?)",
                (claims["jti"], claims["exp"]),
            )

    def admin(self, token, db):
        principal = self.authenticate(token, db)
        if principal["user"]["role"] != "sysadmin":
            raise HTTPException(403, "Sysadmin access required")
        return principal["user"]

    def list_users(self, token):
        with self.connect() as db:
            self.admin(token, db)
            return [
                public_user(r)
                for r in db.execute(
                    "SELECT * FROM auth_users ORDER BY created_at DESC LIMIT 500"
                )
            ]

    def change_user(self, token, ident, action, role=None, status=None):
        with self.connect(write=True) as db:
            actor = self.admin(token, db)
            user = db.execute(
                "SELECT * FROM auth_users WHERE id=?", (ident,)
            ).fetchone()
            if not user:
                raise HTTPException(404, "User not found")
            before = {"status": user["status"], "role": user["role"]}
            after = dict(before)
            if action in ("approve", "reject"):
                if user["status"] != "pending":
                    raise HTTPException(409, "Only pending users can be reviewed")
                after = {
                    "status": "active" if action == "approve" else "rejected",
                    "role": role if action == "approve" else None,
                }
            elif action == "role_change":
                if user["status"] not in ("active", "suspended"):
                    raise HTTPException(409, "User must be approved first")
                after["role"] = role
            elif action == "status_change":
                if user["status"] not in ("active", "suspended"):
                    raise HTTPException(409, "User must be approved first")
                after["status"] = status
            else:
                raise ValueError("Unknown action")
            if before == {"status": "active", "role": "sysadmin"} and after != before:
                admins = db.execute(
                    "SELECT count(*) FROM auth_users WHERE status='active' AND role='sysadmin'"
                ).fetchone()[0]
                if admins <= 1:
                    raise HTTPException(409, "Cannot remove the last active sysadmin")
            db.execute(
                "UPDATE auth_users SET status=?,role=? WHERE id=?",
                (after["status"], after["role"], ident),
            )
            self.audit(db, actor["id"], ident, action, before, after)
            return public_user(
                db.execute("SELECT * FROM auth_users WHERE id=?", (ident,)).fetchone()
            )

    def audit_log(self, token):
        with self.connect() as db:
            self.admin(token, db)
            return [
                dict(r)
                for r in db.execute(
                    "SELECT * FROM auth_audit ORDER BY id DESC LIMIT 500"
                )
            ]
