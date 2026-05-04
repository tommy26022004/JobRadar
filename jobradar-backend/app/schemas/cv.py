from pydantic import BaseModel
from datetime import datetime


class CVCreate(BaseModel):
    name: str
    content: str


class CVUpdate(BaseModel):
    name: str | None = None
    content: str | None = None


class CVResponse(BaseModel):
    id: int
    name: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True
