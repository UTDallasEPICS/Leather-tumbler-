"""Request bodies for /api/runs. The run itself is a free-form document (see lib/runs-api.ts)."""

from pydantic import BaseModel, Field


class RunIn(BaseModel):
    run: dict


class RunPutIn(BaseModel):
    run: dict
    baseRev: int


class OverrideIn(BaseModel):
    reason: str = Field(min_length=1, max_length=200)


class ImportIn(BaseModel):
    runs: list[dict] = Field(max_length=500)
