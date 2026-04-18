"""Twilio-backed OTP delivery service."""

import random
import httpx


class OtpService:
    def __init__(self, twilio_cfg: dict, otp_cfg: dict):
        self.sid = (twilio_cfg.get("account_sid") or "").strip()
        self.token = (twilio_cfg.get("auth_token") or "").strip()
        self.from_phone = (twilio_cfg.get("from_phone") or "").strip()
        self.code_ttl_seconds = int(twilio_cfg.get("otp_ttl_seconds", 300))
        self.code_length = int(twilio_cfg.get("otp_length", 6))
        self.mode = (otp_cfg.get("mode") or "mock").strip().lower()

    @property
    def use_mock_mode(self) -> bool:
        return self.mode != "twilio"

    @property
    def sms_enabled(self) -> bool:
        return (not self.use_mock_mode) and bool(self.sid and self.token and self.from_phone)

    async def send_otp_sms(self, phone: str, code: str) -> bool:
        if not self.sms_enabled:
            return False
        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.sid}/Messages.json"
        body = f"DAVA PIN reset code: {code}. It expires in {self.code_ttl_seconds // 60} minutes."
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                url,
                data={"To": phone, "From": self.from_phone, "Body": body},
                auth=(self.sid, self.token),
            )
            response.raise_for_status()
            return True

    def generate_code(self) -> str:
        max_num = 10 ** self.code_length
        return str(random.randrange(max_num)).zfill(self.code_length)
