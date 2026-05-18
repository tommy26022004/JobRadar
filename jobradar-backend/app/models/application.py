from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    cv_id = Column(Integer, ForeignKey("cvs.id"), nullable=True)
    status = Column(String, default="saved")  # saved, applied, interview, offer, rejected
    match_score = Column(Float, nullable=True)
    ai_analysis = Column(Text, nullable=True)
    cv_suggestions = Column(Text, nullable=True)
    interview_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    job = relationship("Job", back_populates="applications")
    cv = relationship("CV", back_populates="applications")
