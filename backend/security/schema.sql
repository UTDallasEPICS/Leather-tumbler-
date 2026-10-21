CREATE TABLE IF NOT EXISTS auth_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','active','rejected','suspended')),
    role TEXT CHECK (role IN ('worker','sysadmin')),
    created_at INTEGER NOT NULL,
    CHECK ((status IN ('pending','rejected') AND role IS NULL)
        OR (status IN ('active','suspended') AND role IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS auth_bootstrap (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_denylist (
    jti TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_denylist_expiry ON auth_denylist(expires_at);
CREATE TABLE IF NOT EXISTS auth_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT,
    target_id TEXT NOT NULL,
    action TEXT NOT NULL,
    before_state TEXT NOT NULL,
    after_state TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS auth_audit_no_update BEFORE UPDATE ON auth_audit
BEGIN SELECT RAISE(ABORT, 'Audit records are append-only'); END;
CREATE TRIGGER IF NOT EXISTS auth_audit_no_delete BEFORE DELETE ON auth_audit
BEGIN SELECT RAISE(ABORT, 'Audit records are append-only'); END;
CREATE TABLE IF NOT EXISTS auth_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient TEXT NOT NULL,
    applicant_email TEXT NOT NULL,
    applicant_name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    sent_at INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0
);
