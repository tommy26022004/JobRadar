from pydantic import BaseModel, Field
from datetime import datetime


class CVCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1, max_length=100_000)


class CVUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    content: str | None = Field(default=None, max_length=100_000)


class CVResponse(BaseModel):
    id: int
    name: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True
