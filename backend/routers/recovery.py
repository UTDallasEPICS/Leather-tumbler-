"""Recovery phone registration + lookup."""

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
import aiosqlite

from db import get_recovery_phone, set_recovery_phone
from deps import get_db
from schemas.recovery import PhoneIn, RecoveryPhoneOut, RegisterPhoneOut
from services.phone import is_valid_phone, normalize_phone

router = APIRouter(tags=["recovery"])


@router.get("/phone", response_model=RecoveryPhoneOut)
async def read_phone(db: aiosqlite.Connection = Depends(get_db)) -> RecoveryPhoneOut:
    phone = await get_recovery_phone(db)
    return RecoveryPhoneOut(success=True, phone=phone)


@router.put("/phone")
async def register_phone(
    body: PhoneIn,
    db: aiosqlite.Connection = Depends(get_db),
):
    phone = normalize_phone(body.phone)
    if not is_valid_phone(phone):
        return JSONResponse(
            status_code=400,
            content=RegisterPhoneOut(
                success=False,
                message="Invalid phone number format. Use country code, e.g. +15551234567.",
            ).model_dump(),
        )

    await set_recovery_phone(db, phone)
    return RegisterPhoneOut(
        success=True,
        message="Recovery phone registered.",
        phone=phone,
    )
