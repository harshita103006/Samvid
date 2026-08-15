from datetime import datetime

from pydantic import BaseModel, Field


class RecordResponse(BaseModel):
    id: int
    owner_id: int
    title: str
    record_type: str
    file_path: str
    file_hash: str
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class RecordListResponse(BaseModel):
    records: list[RecordResponse]
    total: int
