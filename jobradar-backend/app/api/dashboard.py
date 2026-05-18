import json
import re
import asyncio
from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Date
from app.core.database import get_db
from app.api.deps import get_current_user
from app.api.discover import _get_ai_client, match_job, SCAN_MODEL
from app.models.user import User
from app.models.application import Application
from app.models.job import Job
from app.models.cv import CV
from app.models.seen_job import SeenJob
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
    from app.api.discover import _extract_cv_domain_words, _keyword_prefilter
    cv_keywords = _extract_cv_domain_words(cv_content)
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


# ---------------------------------------------------------------------------
# Category detection helpers
# ---------------------------------------------------------------------------

_CATEGORY_KEYWORDS: list[tuple[str, list[str]]] = [
    ("Full Stack",  ["fullstack", "full stack", "full-stack"]),
    ("Frontend",    ["frontend", "front-end", "react", "vue", "angular", "next.js", "ui developer", "ui engineer"]),
    ("Backend",     ["backend", "back-end", "node", "python", "django", "fastapi", "rails", "java", "golang", "go developer", "software engineer", "software developer", "api developer", "api engineer"]),
    ("DevOps",      ["devops", "sre", "infrastructure", "kubernetes", "docker", "cloud", "aws", "gcp", "azure", "platform engineer", "site reliability"]),
    ("Data / ML",   ["data", "ml", "machine learning", "ai engineer", "analyst", "scientist", "nlp", "llm", "deep learning"]),
    ("Mobile",      ["mobile", "ios", "android", "flutter", "react native", "swift", "kotlin"]),
    ("Design",      ["design", "ui/ux", "ux", "figma", "product design", "graphic"]),
    ("Marketing",   ["marketing", "growth", "seo", "social media", "content", "copywriter", "brand"]),
    ("Product",     ["product manager", "product owner", "scrum master", "agile"]),
    ("Sales",       ["sales", "account executive", "business development", "account manager"]),
]


def _detect_category(title: str) -> str:
    """Return the first matching category or 'Other'."""
    if not title:
        return "Other"
    lower = title.lower()
    for category, keywords in _CATEGORY_KEYWORDS:
        for kw in keywords:
            if kw in lower:
                return category
    return "Other"


@router.get("/job-categories")
async def get_job_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all unique job categories the current user has seen."""
    rows = (
        db.query(SeenJob.title)
        .filter(SeenJob.user_id == current_user.id, SeenJob.title.isnot(None), SeenJob.title != "")
        .all()
    )
    seen_categories: set[str] = set()
    for (title,) in rows:
        seen_categories.add(_detect_category(title))

    # Return in a stable order matching _CATEGORY_KEYWORDS, then "Other"
    ordered = [c for c, _ in _CATEGORY_KEYWORDS if c in seen_categories]
    if "Other" in seen_categories:
        ordered.append("Other")
    return {"categories": ordered}


@router.get("/job-trends")
async def get_job_trends(
    days: int = Query(7, ge=0, le=90),
    hours: int = Query(0, ge=0, le=24),
    categories: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import datetime as dt
    now = dt.now(timezone.utc)

    requested: list[str] | None = None
    if categories:
        requested = [c.strip() for c in categories.split(",") if c.strip()]

    # --- hourly mode (1h or 24h) ---
    if hours > 0:
        since = now - timedelta(hours=hours)
        slot_minutes = 10 if hours == 1 else 60
        n_slots = (hours * 60) // slot_minutes

        rows = (
            db.query(SeenJob.first_seen_at, SeenJob.title)
            .filter(
                SeenJob.user_id == current_user.id,
                SeenJob.title.isnot(None), SeenJob.title != "",
                SeenJob.first_seen_at >= since,
            )
            .all()
        )

        # Build slot labels and index
        slots = [(since + timedelta(minutes=i * slot_minutes)) for i in range(n_slots)]
        def slot_label(dt_val):
            return dt_val.strftime("%H:%M")
        slot_labels = [slot_label(s) for s in slots]

        counts: dict[str, dict[str, int]] = {}
        for ts, title in rows:
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            cat = _detect_category(title or "")
            idx = int((ts - since).total_seconds() // (slot_minutes * 60))
            if 0 <= idx < n_slots:
                label = slot_labels[idx]
                counts.setdefault(cat, {})
                counts[cat][label] = counts[cat].get(label, 0) + 1

        if requested:
            active_cats = [c for c in requested if c in counts]
        else:
            sorted_cats = sorted(counts.keys(), key=lambda c: sum(counts[c].values()), reverse=True)
            active_cats = sorted_cats[:3]

        series = [{"category": cat, "data": [counts.get(cat, {}).get(l, 0) for l in slot_labels]} for cat in active_cats]
        return {"dates": slot_labels, "series": series}

    # --- daily mode ---
    end_date = date.today()
    start_date = end_date - timedelta(days=max(days - 1, 0))

    rows = (
        db.query(cast(SeenJob.first_seen_at, Date).label("day"), SeenJob.title)
        .filter(
            SeenJob.user_id == current_user.id,
            SeenJob.title.isnot(None), SeenJob.title != "",
            cast(SeenJob.first_seen_at, Date) >= start_date,
            cast(SeenJob.first_seen_at, Date) <= end_date,
        )
        .all()
    )

    date_list = [start_date + timedelta(days=i) for i in range(max(days, 1))]
    date_str_list = [d.isoformat() for d in date_list]

    counts: dict[str, dict[str, int]] = {}
    for row_day, title in rows:
        cat = _detect_category(title or "")
        day_str = row_day.isoformat() if hasattr(row_day, "isoformat") else str(row_day)
        if day_str not in date_str_list:
            continue
        counts.setdefault(cat, {})
        counts[cat][day_str] = counts[cat].get(day_str, 0) + 1

    if not counts:
        return {"dates": [], "series": []}

    # Trim leading all-zero dates so chart starts at first data point
    first_data_idx = 0
    for i, d in enumerate(date_str_list):
        if any(counts.get(cat, {}).get(d, 0) > 0 for cat in counts):
            first_data_idx = i
            break
    date_str_list = date_str_list[first_data_idx:]

    if requested:
        active_cats = [c for c in requested if c in counts]
    else:
        sorted_cats = sorted(counts.keys(), key=lambda c: sum(counts[c].values()), reverse=True)
        active_cats = sorted_cats[:3]

    series = [{"category": cat, "data": [counts.get(cat, {}).get(d, 0) for d in date_str_list]} for cat in active_cats]
    return {"dates": date_str_list, "series": series}
