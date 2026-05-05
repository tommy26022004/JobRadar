import json
import asyncio
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.cv import CV
from app.agents.rss_fetcher import fetch_all_jobs, RemoteJob
from groq import AsyncGroq
from app.core.config import settings
from typing import Annotated

router = APIRouter(prefix="/discover", tags=["discover"])

# Fast model for scanning — 3-4x faster, higher token limits
SCAN_MODEL = "llama-3.1-8b-instant"


def _get_ai_client(user: User):
    """Return (client, model, provider) using user's key if set, else server default."""
    provider = user.ai_provider or "groq"
    api_key = user.ai_api_key or None

    if provider == "groq" or not api_key:
        key = api_key or settings.GROQ_API_KEY
        # Always use fast scan model unless user explicitly set a model
        model = user.ai_model or SCAN_MODEL
        return AsyncGroq(api_key=key), model, "groq"

    if provider == "gemini":
        key = api_key or settings.GROQ_API_KEY
        model = user.ai_model or SCAN_MODEL
        return AsyncGroq(api_key=key), model, "groq"

    if provider == "openai":
        from openai import AsyncOpenAI
        model = user.ai_model or "gpt-4o-mini"
        return AsyncOpenAI(api_key=api_key), model, "openai"

    return AsyncGroq(api_key=settings.GROQ_API_KEY), SCAN_MODEL, "groq"



def _extract_cv_domain_words(cv_content: str) -> set[str]:
    """
    Extract meaningful domain words from CV — job titles, skills, industries.
    These represent what the user actually does, used to filter irrelevant jobs.
    """
    text = cv_content.lower()
    words: set[str] = set()

    # Job title / role words (2+ chars, skip stop words)
    stop = {
        'the', 'and', 'for', 'with', 'this', 'that', 'have', 'from',
        'are', 'was', 'were', 'has', 'had', 'been', 'will', 'can',
        'all', 'not', 'but', 'our', 'your', 'their', 'its', 'an',
        'in', 'on', 'at', 'to', 'of', 'a', 'is', 'i', 'my', 'me',
        'we', 'by', 'or', 'as', 'be', 'do', 'so', 'if', 'up', 'it',
        'he', 'she', 'they', 'who', 'what', 'how', 'when', 'where',
        'also', 'both', 'each', 'than', 'more', 'some', 'any', 'use',
        'using', 'used', 'work', 'worked', 'working', 'team', 'year',
        'years', 'month', 'months', 'new', 'good', 'great', 'strong',
        'experience', 'knowledge', 'skills', 'ability', 'responsible',
    }

    # Extract all words 3+ chars that aren't stop words
    raw = re.findall(r'\b[a-z][a-z0-9+#\.]{2,}\b', text)
    for w in raw:
        if w not in stop:
            words.add(w)

    return words


def _keyword_prefilter(jobs: list[RemoteJob], cv_keywords: set[str], max_jobs: int = 80) -> list[RemoteJob]:
    """
    Sort jobs by keyword overlap with CV domain words.
    Jobs with zero overlap are still kept (up to max_jobs) since RSS titles
    can be terse — we don't hard-exclude anything.
    """
    if not cv_keywords:
        return jobs[:max_jobs]

    def keyword_score(job: RemoteJob) -> int:
        text = (job.title + " " + job.description[:800]).lower()
        return sum(1 for kw in cv_keywords if re.search(r'\b' + re.escape(kw) + r'\b', text))

    scored = sorted(jobs, key=keyword_score, reverse=True)
    return scored[:max_jobs]


async def match_job(job: RemoteJob, cv_content: str, client, model: str, retries: int = 1) -> dict:
    prompt = f"""Score how well this CV matches the job. Return ONLY JSON.

Job: {job.title} at {job.company}
Description: {job.description[:1500]}

CV: {cv_content[:1500]}

{{"score": <0-100>, "reason": "<one sentence>"}}"""

    for attempt in range(retries + 1):
        try:
            resp = await client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=80,
            )
            text = resp.choices[0].message.content.strip()
            text = re.sub(r"^```json|^```|```$", "", text, flags=re.MULTILINE).strip()
            data = json.loads(text)
            return {"score": int(data.get("score", 0)), "reason": data.get("reason", "")}
        except Exception:
            if attempt < retries:
                await asyncio.sleep(2)
            else:
                return {"score": -1, "reason": "Could not analyze"}


@router.get("/")
async def discover(
    cv_id: int = 0,
    sources: Annotated[list[str], Query()] = ["wwr", "remoteok", "remotive"],
    custom_urls: Annotated[list[str], Query()] = [],
    limit_per_source: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cvs = db.query(CV).filter(CV.user_id == current_user.id).all()
    if not cvs:
        raise HTTPException(status_code=400, detail="No CVs found. Please add a CV first.")

    cv = next((c for c in cvs if c.id == cv_id), cvs[0])
    cv_content = cv.content
    cv_keywords = _extract_cv_domain_words(cv_content)
    ai_client, ai_model, ai_provider = _get_ai_client(current_user)

    async def stream():
        try:
            source_labels = {"wwr": "WeWorkRemotely", "remoteok": "RemoteOK", "remotive": "Remotive"}
            active = [source_labels.get(s, s) for s in sources]
            if custom_urls:
                active += [f"Custom ({len(custom_urls)} feed{'s' if len(custom_urls) > 1 else ''})"]

            sources_str = ", ".join(active)
            yield f"data: {json.dumps({'event': 'fetching', 'message': f'Fetching jobs from {sources_str}...'})}\n\n"

            all_jobs = await fetch_all_jobs(
                limit_per_source=min(limit_per_source, 50),
                sources=sources,
                custom_urls=custom_urls,
            )

            # Pre-filter: keyword match → max 80 jobs for AI scoring
            jobs = _keyword_prefilter(all_jobs, cv_keywords, max_jobs=80)
            skipped = len(all_jobs) - len(jobs)

            msg = f"Found {len(all_jobs)} jobs"
            if skipped > 0:
                msg += f", pre-filtered to {len(jobs)} relevant"
            msg += ". Matching with your CV..."
            yield f"data: {json.dumps({'event': 'fetched', 'count': len(jobs), 'message': msg})}\n\n"

            if not jobs:
                yield f"data: {json.dumps({'event': 'done', 'results': []})}\n\n"
                return

            results = []
            batch_size = 8
            for i in range(0, len(jobs), batch_size):
                batch = jobs[i:i + batch_size]
                scores = await asyncio.gather(*[match_job(job, cv_content, ai_client, ai_model) for job in batch])

                for job, score_data in zip(batch, scores):
                    if score_data["score"] == -1:
                        continue
                    result = {
                        "id": job.id,
                        "title": job.title,
                        "company": job.company,
                        "url": job.url,
                        "region": job.region,
                        "region_group": job.region_group,
                        "job_type": job.job_type,
                        "experience_level": job.experience_level,
                        "score": score_data["score"],
                        "reason": score_data["reason"],
                        "description": job.description[:500],
                        "source": job.source,
                    }
                    results.append(result)
                    yield f"data: {json.dumps({'event': 'matched', 'job': result})}\n\n"

                if i + batch_size < len(jobs):
                    await asyncio.sleep(1)

            results.sort(key=lambda x: x["score"], reverse=True)
            yield f"data: {json.dumps({'event': 'done', 'results': results})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
