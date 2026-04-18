from pydantic import BaseModel


class PhoneIn(BaseModel):
    phone: str


class RecoveryPhoneOut(BaseModel):
    success: bool
    phone: str


class RegisterPhoneOut(BaseModel):
    success: bool
    message: str
    phone: str | None = None
