"""Explicit authentication configuration; no development signing-key fallback."""

import base64
import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class AuthSettings:
    signing_key: bytes = field(repr=False)
    issuer: str = "dava-auth"
    audience: str = "dava-api"
    origins: tuple[str, ...] = ("http://localhost:3000", "http://127.0.0.1:3000")
    smtp_host: str = ""
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_password: str = field(default="", repr=False)
    smtp_from: str = ""

    def __post_init__(self):
        if len(self.signing_key) < 32:
            raise ValueError("AUTH_JWT_KEY must decode to at least 32 random bytes")
        if not self.issuer or not self.audience or "*" in self.origins:
            raise ValueError(
                "Explicit issuer, audience and allowed origins are required"
            )
        smtp = (self.smtp_host, self.smtp_user, self.smtp_password, self.smtp_from)
        if any(smtp) and not all(smtp):
            raise ValueError("Set all SMTP settings, or leave all unset")

    @classmethod
    def from_env(cls):
        try:
            key = base64.b64decode(os.environ["AUTH_JWT_KEY"], validate=True)
        except (KeyError, ValueError) as exc:
            raise ValueError(
                "Set AUTH_JWT_KEY to a base64-encoded random signing key"
            ) from exc
        return cls(
            signing_key=key,
            issuer=os.getenv("AUTH_ISSUER", "dava-auth"),
            audience=os.getenv("AUTH_AUDIENCE", "dava-api"),
            origins=tuple(
                x.strip()
                for x in os.getenv(
                    "AUTH_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
                ).split(",")
                if x.strip()
            ),
            smtp_host=os.getenv("AUTH_SMTP_HOST", ""),
            smtp_port=int(os.getenv("AUTH_SMTP_PORT", "465")),
            smtp_user=os.getenv("AUTH_SMTP_USER", ""),
            smtp_password=os.getenv("AUTH_SMTP_PASSWORD", ""),
            smtp_from=os.getenv("AUTH_SMTP_FROM", ""),
        )
