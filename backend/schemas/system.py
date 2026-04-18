from pydantic import BaseModel


class SystemState(BaseModel):
    active: bool
    cycles: int


class SystemActionResponse(BaseModel):
    success: bool
    state: SystemState


class ClearLogsResponse(BaseModel):
    success: bool


class RelayStatus(BaseModel):
    output: bool | None = None
    source: str | None = None
    error: bool | None = None
