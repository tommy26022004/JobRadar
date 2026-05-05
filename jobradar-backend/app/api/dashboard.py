import json
import re
import asyncio
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.api.deps import get_current_user
from app.api.discover import _get_ai_client, match_job, SCAN_MODEL
from app.models.user import User
from app.models.application import Application
from app.models.job import Job
from app.models.cv import CV
from app.agents.rss_fetcher import fetch_all_jobs
from groq import AsyncGroq
from app.core.config import settings

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# In-memory quota cache: user_id -> {remaining_requests, remaining_tokens, reset_requests, reset_tokens, updated_at}
_quota_cache: dict[int, dict] = {}


async def _fetch_groq_quota(api_key: str) -> dict:
    """Make a minimal Groq call and read rate limit headers."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            resp = await c.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": "llama-3.1-8b-instant",
                    "messages": [{"role": "user", "content": "hi"}],
                    "max_tokens": 1,
                },
            )
            h = resp.headers
            return {
                "remaining_requests": int(h.get("x-ratelimit-remaining-requests", -1)),
                "limit_requests": int(h.get("x-ratelimit-limit-requests", 6000)),
                "remaining_tokens": int(h.get("x-ratelimit-remaining-tokens", -1)),
                "limit_tokens": int(h.get("x-ratelimit-limit-tokens", 500000)),
                "reset_requests": h.get("x-ratelimit-reset-requests", ""),
                "reset_tokens": h.get("x-ratelimit-reset-tokens", ""),
            }
    except Exception:
        return {}


@router.get("/stats")
async def get_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Kanban stats + AI quota."""
    apps = db.query(Application).filter(Application.user_id == current_user.id).all()
    total = len(apps)
    by_status = {}
    scores = []
    for a in apps:
        by_status[a.status] = by_status.get(a.status, 0) + 1
        if a.match_score:
            scores.append(a.match_score)

    avg_score = round(sum(scores) / len(scores)) if scores else 0

    # Quota
    quota = {}
    provider = current_user.ai_provider or "groq"
    if provider == "groq":
        api_key = current_user.ai_api_key or settings.GROQ_API_KEY
        cached = _quota_cache.get(current_user.id)
        import time
        if cached and time.time() - cached.get("_ts", 0) < 300:
            quota = {k: v for k, v in cached.items() if not k.startswith("_")}
        else:
            quota = await _fetch_groq_quota(api_key)
            quota["_ts"] = time.time()
            _quota_cache[current_user.id] = quota
            quota = {k: v for k, v in quota.items() if not k.startswith("_")}

    return {
        "total_jobs": total,
        "by_status": {
            "saved": by_status.get("saved", 0),
            "applied": by_status.get("applied", 0),
            "interview": by_status.get("interview", 0),
            "offer": by_status.get("offer", 0),
            "rejected": by_status.get("rejected", 0),
        },
        "avg_score": avg_score,
        "quota": quota,
        "provider": provider,
    }


@router.get("/new-matches")
async def get_new_matches(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Quick scan — top 5 job matches for dashboard widget."""
    cvs = db.query(CV).filter(CV.user_id == current_user.id).all()
    if not cvs:
        return {"matches": [], "total_scanned": 0}

    cv = cvs[0]
    cv_content = cv.content
    ai_client, _, _ = _get_ai_client(current_user)
    ai_model = SCAN_MODEL  # always use fast model for dashboard widget

    # Fetch 15 per source, pre-filter by CV keywords before AI scoring
    from app.api.discover import _extract_cv_keywords, _keyword_prefilter
    cv_keywords = _extract_cv_keywords(cv_content)
    all_jobs = await fetch_all_jobs(limit_per_source=15, sources=["wwr", "remoteok", "remotive"])
    jobs = _keyword_prefilter(all_jobs, cv_keywords, max_jobs=30)

    # Score in batches of 8 with fast model
    results = []
    batch_size = 8
    for i in range(0, len(jobs), batch_size):
        batch = jobs[i:i + batch_size]
        scores = await asyncio.gather(*[match_job(j, cv_content, ai_client, ai_model) for j in batch])
        for job, score_data in zip(batch, scores):
            if score_data["score"] > 0:
                results.append({
                    "title": job.title,
                    "company": job.company,
                    "url": job.url,
                    "score": score_data["score"],
                    "reason": score_data["reason"],
                    "source": job.source,
                    "experience_level": job.experience_level,
                })
        if i + batch_size < len(jobs):
            await asyncio.sleep(1)

    results.sort(key=lambda x: x["score"], reverse=True)
    top5 = [r for r in results if r["score"] >= 50][:5]

    return {"matches": top5, "total_scanned": len(results)}
