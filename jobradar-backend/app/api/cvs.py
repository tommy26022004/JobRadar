from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.cv import CV
from app.schemas.cv import CVCreate, CVUpdate, CVResponse

router = APIRouter(prefix="/cvs", tags=["cvs"])


@router.get("/", response_model=list[CVResponse])
def list_cvs(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(CV)
        .filter(CV.user_id == current_user.id)
        .order_by(CV.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.post("/", response_model=CVResponse, status_code=201)
def create_cv(body: CVCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cv = CV(user_id=current_user.id, name=body.name, content=body.content)
    db.add(cv)
    db.commit()
    db.refresh(cv)
    return cv


@router.get("/{cv_id}", response_model=CVResponse)
def get_cv(cv_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cv = db.query(CV).filter(CV.id == cv_id, CV.user_id == current_user.id).first()
    if not cv:
        raise HTTPException(status_code=404, detail="CV not found")
    return cv


@router.patch("/{cv_id}", response_model=CVResponse)
def update_cv(cv_id: int, body: CVUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cv = db.query(CV).filter(CV.id == cv_id, CV.user_id == current_user.id).first()
    if not cv:
        raise HTTPException(status_code=404, detail="CV not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(cv, field, value)
    db.commit()
    db.refresh(cv)
    return cv


@router.delete("/{cv_id}", status_code=204)
def delete_cv(cv_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cv = db.query(CV).filter(CV.id == cv_id, CV.user_id == current_user.id).first()
    if not cv:
        raise HTTPException(status_code=404, detail="CV not found")
    db.delete(cv)
    db.commit()
