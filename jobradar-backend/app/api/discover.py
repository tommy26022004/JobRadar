import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.cv import CV
from app.agents.rss_fetcher import fetch_jobs, RemoteJob
from groq import AsyncGroq
from app.core.config import settings

router = APIRouter(prefix="/discover", tags=["discover"])

client = AsyncGroq(api_key=settings.GROQ_API_KEY)


async def match_job(job: RemoteJob, cv_content: str) -> dict:
    prompt = f"""You are a technical recruiter. Score how well this candidate's CV matches the job.

Job Title: {job.title}
Company: {job.company}
Job Description:
{job.description[:2000]}

Candidate CV:
{cv_content[:2000]}

Return ONLY a JSON object:
{{
  "score": <integer 0-100>,
  "reason": "<one sentence why>"
}}

No markdown, no explanation."""

    try:
        resp = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        text = resp.choices[0].message.content.strip()
        import re
        text = re.sub(r"^```json|^```|```$", "", text, flags=re.MULTILINE).strip()
        data = json.loads(text)
        return {"score": int(data.get("score", 0)), "reason": data.get("reason", "")}
    except Exception:
        return {"score": 0, "reason": "Could not analyze"}


@router.get("/")
async def discover(
    category: str = "programming",
    limit: int = 20,
    cv_id: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cvs = db.query(CV).filter(CV.user_id == current_user.id).all()
    if not cvs:
        raise HTTPException(status_code=400, detail="No CVs found. Please add a CV first.")

    cv = next((c for c in cvs if c.id == cv_id), cvs[0])
    cv_content = cv.content

    async def stream():
        try:
            yield f"data: {json.dumps({'event': 'fetching', 'message': 'Fetching jobs from WeWorkRemotely...'})}\n\n"

            jobs = await fetch_jobs(category=category, limit=min(limit, 30))

            yield f"data: {json.dumps({'event': 'fetched', 'count': len(jobs), 'message': f'Found {len(jobs)} jobs. Matching with your CV...'})}\n\n"

            results = []
            # Process in batches of 5 to avoid rate limiting
            batch_size = 5
            for i in range(0, len(jobs), batch_size):
                batch = jobs[i:i + batch_size]
                scores = await asyncio.gather(*[match_job(job, cv_content) for job in batch])

                for job, score_data in zip(batch, scores):
                    result = {
                        "id": job.id,
                        "title": job.title,
                        "company": job.company,
                        "url": job.url,
                        "region": job.region,
                        "score": score_data["score"],
                        "reason": score_data["reason"],
                        "description": job.description[:500],
                    }
                    results.append(result)
                    yield f"data: {json.dumps({'event': 'matched', 'job': result})}\n\n"

                # small delay between batches
                if i + batch_size < len(jobs):
                    await asyncio.sleep(1)

            # sort and send final ranked list
            results.sort(key=lambda x: x["score"], reverse=True)
            yield f"data: {json.dumps({'event': 'done', 'results': results})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
