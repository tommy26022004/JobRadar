from pydantic import BaseModel, Field
from datetime import datetime
from typing import Literal


class ApplicationCreate(BaseModel):
    job_id: int
    cv_id: int | None = None


class ApplicationUpdate(BaseModel):
    status: Literal["saved", "applied", "interview", "offer", "rejected"] | None = None
    cv_id: int | None = None
    interview_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=5000)


class ApplicationResponse(BaseModel):
    id: int
    job_id: int
    cv_id: int | None
    status: str
    match_score: float | None
    ai_analysis: str | None
    cv_suggestions: str | None
    interview_at: datetime | None
    notes: str | None
    created_at: datetime
    updated_at: datetime | None

    class Config:
        from_attributes = True
