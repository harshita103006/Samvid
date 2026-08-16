from datetime import datetime

from pydantic import BaseModel


class ConsentApproval(BaseModel):
    start_time: datetime
    expiry_time: datetime