from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.application import Application
from app.models.job import Job
from app.schemas.application import ApplicationCreate, ApplicationUpdate, ApplicationResponse

router = APIRouter(prefix="/applications", tags=["applications"])


@router.get("/", response_model=list[ApplicationResponse])
def list_applications(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Application)
        .filter(Application.user_id == current_user.id)
        .order_by(Application.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.post("/", response_model=ApplicationResponse, status_code=201)
def create_application(body: ApplicationCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    job = db.query(Job).filter(Job.id == body.job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    application = Application(user_id=current_user.id, job_id=body.job_id, cv_id=body.cv_id)
    db.add(application)
    db.commit()
    db.refresh(application)
    return application


@router.get("/{app_id}", response_model=ApplicationResponse)
def get_application(app_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    app = db.query(Application).filter(Application.id == app_id, Application.user_id == current_user.id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


@router.patch("/{app_id}", response_model=ApplicationResponse)
def update_application(app_id: int, body: ApplicationUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    app = db.query(Application).filter(Application.id == app_id, Application.user_id == current_user.id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(app, field, value)
    db.commit()
    db.refresh(app)
    return app


@router.delete("/{app_id}", status_code=204)
def delete_application(app_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    app = db.query(Application).filter(Application.id == app_id, Application.user_id == current_user.id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    db.delete(app)
    db.commit()
