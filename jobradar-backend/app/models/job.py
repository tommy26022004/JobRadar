from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=True)
    company = Column(String, nullable=True)
    raw_jd = Column(Text, nullable=False)
    parsed_title = Column(String, nullable=True)
    parsed_company = Column(String, nullable=True)
    parsed_stack = Column(Text, nullable=True)
    parsed_requirements = Column(Text, nullable=True)
    parsed_salary = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="jobs")
    applications = relationship("Application", back_populates="job", cascade="all, delete-orphan")
