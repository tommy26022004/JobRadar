from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.job import Job
from app.schemas.job import JobCreate, JobResponse

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/", response_model=list[JobResponse])
def list_jobs(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Job)
        .filter(Job.user_id == current_user.id)
        .order_by(Job.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.post("/", response_model=JobResponse, status_code=201)
def create_job(body: JobCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    job = Job(user_id=current_user.id, raw_jd=body.raw_jd, title=body.title, company=body.company)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.delete("/{job_id}", status_code=204)
def delete_job(job_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    db.delete(job)
    db.commit()
