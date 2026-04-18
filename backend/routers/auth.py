"""PIN-reset OTP: request + verify."""

import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
import aiosqlite

from db import (
    cleanup_old_otps,
    create_otp,
    get_recovery_phone,
    verify_and_consume_otp,
)
from deps import get_db, get_otp_service
from schemas.auth import OtpRequestIn, OtpRequestOut, OtpVerifyIn, OtpVerifyOut
from services.otp import OtpService
from services.phone import is_valid_phone, normalize_phone, phones_match

log = logging.getLogger("sensorhub.router.auth")
router = APIRouter(tags=["auth"])


def _error(status: int, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content=OtpRequestOut(success=False, message=message).model_dump(),
    )


@router.post("/otp/request")
async def request_otp(
    body: OtpRequestIn,
    db: aiosqlite.Connection = Depends(get_db),
    otp_service: OtpService = Depends(get_otp_service),
):
    phone = normalize_phone(body.phone)
    if not is_valid_phone(phone):
        return _error(400, "Invalid phone number.")

    registered_phone = await get_recovery_phone(db)
    if not registered_phone:
        return _error(400, "No recovery phone registered. Set it in Account first.")

    if not phones_match(phone, registered_phone):
        return _error(400, "Phone number is not registered.")

    code = otp_service.generate_code()
    expires_at = (
        datetime.now() + timedelta(seconds=otp_service.code_ttl_seconds)
    ).isoformat(timespec="seconds")
    await create_otp(db, phone, code, expires_at)
    await cleanup_old_otps(db, datetime.now().isoformat(timespec="seconds"))

    debug_code = None
    delivery = "sms"
    if otp_service.use_mock_mode:
        delivery = "mock"
        debug_code = code
    else:
        try:
            sent = await otp_service.send_otp_sms(phone, code)
            if not sent:
                return _error(
                    500,
                    "Twilio mode is enabled but credentials are missing.",
                )
        except Exception:
            log.exception("Failed to send OTP SMS")
            return _error(502, "Failed to send OTP SMS. Check SMS provider config.")

    if delivery == "mock":
        log.warning("OTP SMS provider not configured. Mock OTP for %s is %s", phone, code)

    return OtpRequestOut(
        success=True,
        message="OTP sent.",
        delivery=delivery,
        debugCode=debug_code,
    )


@router.post("/otp/verify")
async def verify_otp(
    body: OtpVerifyIn,
    db: aiosqlite.Connection = Depends(get_db),
):
    phone = normalize_phone(body.phone)
    otp_code = body.otp.strip()
    if not phone or not otp_code:
        return JSONResponse(
            status_code=400,
            content=OtpVerifyOut(
                success=False, message="Phone and OTP are required."
            ).model_dump(),
        )

    ok = await verify_and_consume_otp(
        db, phone, otp_code, datetime.now().isoformat(timespec="seconds")
    )
    return OtpVerifyOut(
        success=ok,
        message="OTP verified." if ok else "Invalid or expired OTP.",
    )
