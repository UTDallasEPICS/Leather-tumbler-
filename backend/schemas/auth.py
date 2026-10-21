"""No client-supplied status or role in signup. Unknown fields are rejected."""

from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginIn(StrictModel):
    email: EmailStr = Field(max_length=254)
    password: SecretStr = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return str(value).casefold()


class SignupIn(LoginIn):
    name: str = Field(min_length=1, max_length=100)
    password: SecretStr = Field(min_length=15, max_length=128)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        if not value.strip() or any(ord(c) < 32 or ord(c) == 127 for c in value):
            raise ValueError("Use a name without control characters")
        return value.strip()


class UserOut(BaseModel):
    id: UUID
    email: EmailStr
    name: str
    status: Literal["pending", "active", "rejected", "suspended"]
    role: Literal["worker", "sysadmin"] | None
    created_at: int


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"]
    expires_in: Literal[1800]
    user: UserOut


class MessageOut(BaseModel):
    message: str


class RoleIn(StrictModel):
    role: Literal["worker", "sysadmin"]


class StatusIn(StrictModel):
    status: Literal["active", "suspended"]


class AuditOut(BaseModel):
    id: int
    actor_id: UUID | None
    target_id: UUID
    action: str
    before_state: str
    after_state: str
    created_at: int
