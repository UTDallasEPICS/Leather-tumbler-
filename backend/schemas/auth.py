from pydantic import BaseModel


class OtpRequestIn(BaseModel):
    phone: str


class OtpRequestOut(BaseModel):
    success: bool
    message: str
    delivery: str | None = None
    debugCode: str | None = None


class OtpVerifyIn(BaseModel):
    phone: str
    otp: str


class OtpVerifyOut(BaseModel):
    success: bool
    message: str
