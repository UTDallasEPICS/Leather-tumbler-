from pydantic import BaseModel


class TemperatureReading(BaseModel):
    id: int
    temperature: float
    timestamp: str


class PhReading(BaseModel):
    id: int
    ph: float
    timestamp: str


class HistoryResponse(BaseModel):
    temperature: list[TemperatureReading]
    ph: list[PhReading]
