from pydantic import BaseModel
from datetime import datetime


class JobCreate(BaseModel):
    raw_jd: str
    title: str | None = None
    company: str | None = None


class JobResponse(BaseModel):
    id: int
    title: str | None
    company: str | None
    raw_jd: str
    parsed_title: str | None
    parsed_company: str | None
    parsed_stack: str | None
    parsed_requirements: str | None
    parsed_salary: str | None
    created_at: datetime

    class Config:
        from_attributes = True
