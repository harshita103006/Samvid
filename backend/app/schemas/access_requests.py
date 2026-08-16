from pydantic import BaseModel


class AccessRequestCreate(BaseModel):
    record_id: int
    purpose: str
    requested_access_type: str