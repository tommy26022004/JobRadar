from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class ScanJob(Base):
    __tablename__ = "scan_jobs"

    id = Column(String, primary_key=True)  # UUID
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="running")  # running / done / error
    total = Column(Integer, default=0)
    matched = Column(Integer, default=0)
    message = Column(String, default="")
    results = Column(Text, default="[]")  # JSON array of matched jobs
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
