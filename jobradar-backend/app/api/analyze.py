from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db, SessionLocal
from app.api.deps import get_current_user
from app.models.user import User
from app.models.job import Job
from app.models.cv import CV
from app.models.application import Application
from app.agents.pipeline import run_pipeline_streaming
import json

router = APIRouter(prefix="/analyze", tags=["analyze"])


class AnalyzeRequest(BaseModel):
    raw_jd: str
    cv_id: int
    title: str | None = None
    company: str | None = None


@router.post("/")
async def analyze(
    body: AnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cv = db.query(CV).filter(CV.id == body.cv_id, CV.user_id == current_user.id).first()
    if not cv:
        raise HTTPException(status_code=404, detail="CV not found")

    job = Job(
        user_id=current_user.id,
        raw_jd=body.raw_jd,
        title=body.title,
        company=body.company,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    application = Application(
        user_id=current_user.id,
        job_id=job.id,
        cv_id=cv.id,
        status="saved",
    )
    db.add(application)
    db.commit()
    db.refresh(application)

    job_id = job.id
    app_id = application.id
    cv_content = cv.content  # extract before session closes

    async def stream():
        final_state = {
            "parsed_title": "",
            "parsed_company": "",
            "parsed_stack": "",
            "parsed_requirements": "",
            "parsed_salary": "",
            "match_score": 0.0,
            "ai_analysis": "",
            "cv_suggestions": "",
        }

        async for chunk in run_pipeline_streaming(body.raw_jd, cv_content):
            yield chunk
            if chunk.startswith("data:"):
                try:
                    data = json.loads(chunk[5:].strip())
                    if data.get("event") == "parsed":
                        final_state["parsed_title"] = data.get("title", "")
                        final_state["parsed_company"] = data.get("company", "")
                        final_state["parsed_stack"] = data.get("stack", "")
                        final_state["parsed_salary"] = data.get("salary", "")
                    elif data.get("event") == "matched":
                        final_state["match_score"] = data.get("score", 0)
                        final_state["ai_analysis"] = data.get("analysis", "")
                    elif data.get("event") == "suggested":
                        final_state["cv_suggestions"] = data.get("suggestions", "")
                    elif data.get("event") == "done":
                        save_db = SessionLocal()
                        save_db.query(Job).filter(Job.id == job_id).update({
                            "parsed_title": final_state["parsed_title"],
                            "parsed_company": final_state["parsed_company"],
                            "parsed_stack": final_state["parsed_stack"],
                            "parsed_requirements": final_state["parsed_requirements"],
                            "parsed_salary": final_state["parsed_salary"],
                        })
                        save_db.query(Application).filter(Application.id == app_id).update({
                            "match_score": final_state["match_score"],
                            "ai_analysis": final_state["ai_analysis"],
                            "cv_suggestions": final_state["cv_suggestions"],
                        })
                        save_db.commit()
                        save_db.close()
                        yield f"data: {{\"event\": \"saved\", \"job_id\": {job_id}, \"application_id\": {app_id}}}\n\n"
                except Exception:
                    pass

    return StreamingResponse(stream(), media_type="text/event-stream")
