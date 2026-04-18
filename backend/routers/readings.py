"""Readings history: temperature + pH combined."""

from fastapi import APIRouter, Depends, Query
import aiosqlite

from db import get_ph_readings, get_readings
from deps import get_db
from schemas.readings import HistoryResponse

router = APIRouter(tags=["readings"])


@router.get("/history", response_model=HistoryResponse)
async def history(
    limit: int = Query(100, ge=1, le=1000),
    db: aiosqlite.Connection = Depends(get_db),
) -> HistoryResponse:
    temperature = await get_readings(db, limit)
    ph = await get_ph_readings(db, limit)
    return HistoryResponse(temperature=temperature, ph=ph)
