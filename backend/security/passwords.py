"""RFC 9106 section 4 SECOND RECOMMENDED profile, bounded parallel hashing."""

import secrets
import threading
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from argon2.profiles import RFC_9106_LOW_MEMORY
from fastapi import HTTPException


class Passwords:
    def __init__(self):
        self.hasher = PasswordHasher.from_parameters(RFC_9106_LOW_MEMORY)
        self.slots = threading.BoundedSemaphore(2)
        self.dummy = self.hasher.hash(secrets.token_urlsafe(32))

    def hash(self, password: str) -> str:
        if not self.slots.acquire(blocking=False):
            raise HTTPException(503, "Authentication is busy; retry shortly")
        try:
            return self.hasher.hash(password)
        finally:
            self.slots.release()

    def verify(self, stored: str | None, password: str) -> bool:
        if not self.slots.acquire(blocking=False):
            raise HTTPException(503, "Authentication is busy; retry shortly")
        try:
            try:
                valid = self.hasher.verify(stored or self.dummy, password)
                return bool(stored) and valid
            except (VerificationError, InvalidHashError):
                return False
        finally:
            self.slots.release()

    def needs_rehash(self, stored: str) -> bool:
        # argon2-cffi names this API check_needs_rehash.
        return self.hasher.check_needs_rehash(stored)
