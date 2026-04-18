"""FastAPI dependency providers — resolve shared resources from app.state."""

from starlette.requests import HTTPConnection
import aiosqlite

from relay_controller import RelayController
from services.broadcast import Broadcaster
from services.otp import OtpService


def get_db(conn: HTTPConnection) -> aiosqlite.Connection:
    return conn.app.state.db


def get_relay(conn: HTTPConnection) -> RelayController:
    return conn.app.state.relay


def get_broadcaster(conn: HTTPConnection) -> Broadcaster:
    return conn.app.state.broadcaster


def get_otp_service(conn: HTTPConnection) -> OtpService:
    return conn.app.state.otp_service
