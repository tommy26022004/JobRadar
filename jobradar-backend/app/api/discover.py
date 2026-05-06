import json
import asyncio
import re
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.core.database import get_db, SessionLocal
from app.api.deps import get_current_user
from app.models.user import User
from app.models.cv import CV
from app.models.scan import ScanJob
from app.models.seen_job import SeenJob
from app.agents.rss_fetcher import fetch_all_jobs, RemoteJob, ALL_SOURCES
from groq import AsyncGroq
from app.core.config import settings
from typing import Annotated

router = APIRouter(prefix="/discover", tags=["discover"])

SCAN_MODEL = "llama-3.1-8b-instant"
AUTO_SCAN_COOLDOWN_HOURS = 4
AUTO_SCAN_LIMIT = 15      # jobs per source for auto-scan
HARD_SCAN_LIMIT = 100     # jobs per source for hard scan
FEED_SCORE_THRESHOLD = 50 # minimum score to save into feed


def _get_ai_client(user: User):
    provider = user.ai_provider or "groq"
    api_key = user.ai_api_key or None

    if provider == "groq" or not api_key:
        key = api_key or settings.GROQ_API_KEY
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
    text = cv_content.lower()
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
    raw = re.findall(r'\b[a-z][a-z0-9+#\.]{2,}\b', text)
    return {w for w in raw if w not in stop}


def _keyword_prefilter(jobs: list[RemoteJob], cv_keywords: set[str], max_jobs: int = 80) -> list[RemoteJob]:
    if not cv_keywords:
        return jobs[:max_jobs]

    def keyword_score(job: RemoteJob) -> int:
        text = (job.title + " " + job.description[:800]).lower()
        return sum(1 for kw in cv_keywords if re.search(r'\b' + re.escape(kw) + r'\b', text))

    scored = sorted(jobs, key=keyword_score, reverse=True)
    return scored[:max_jobs]


async def match_job(job: RemoteJob, cv_content: str, client, model: str, retries: int = 1) -> dict:
    prompt = f"""You are a strict recruiter scoring CV-to-job fit. Be harsh and realistic.

SCORING RUBRIC:
- 85-100: Near-perfect match. Same role title, 80%+ of required skills present, right seniority.
- 70-84: Strong match. Core skills align, minor gaps only (1-2 missing tools).
- 50-69: Partial match. Related field but missing key requirements or wrong seniority.
- 30-49: Weak match. Different domain but some transferable skills.
- 0-29: Poor match. Wrong field entirely, most requirements missing.

IMPORTANT: If the job requires skills/domain completely absent from the CV, score MUST be below 40.
Example: Marketing CV vs Software Engineering job = 10-25. DevOps CV vs Sales job = 5-20.

Job Title: {job.title}
Company: {job.company}
Job Description: {job.description[:1200]}

Candidate CV: {cv_content[:1200]}

Return ONLY valid JSON, no explanation outside JSON:
{{"score": <integer 0-100>, "reason": "<one sentence explaining the score>"}}"""

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


def _save_seen_jobs(db: Session, user_id: int, results: list[dict]):
    """Insert matched jobs into seen_jobs — ignore duplicates."""
    for r in results:
        if not r.get("url"):
            continue
        try:
            db.add(SeenJob(user_id=user_id, job_url=r["url"], score=r.get("score", 0)))
            db.flush()
        except IntegrityError:
            db.rollback()
    db.commit()


def _get_seen_urls(db: Session, user_id: int) -> set[str]:
    rows = db.query(SeenJob.job_url).filter(SeenJob.user_id == user_id).all()
    return {r.job_url for r in rows}


async def _run_auto_scan(scan_id: str, user_id: int, cv_content: str, ai_client, ai_model: str):
    """Lightweight background auto-scan — saves results to seen_jobs feed."""
    db = SessionLocal()
    try:
        def update(status=None, message=None, total=None, matched=None, results=None):
            scan = db.query(ScanJob).filter(ScanJob.id == scan_id).first()
            if not scan:
                return
            if status:
                scan.status = status
            if message:
                scan.message = message
            if total is not None:
                scan.total = total
            if matched is not None:
                scan.matched = matched
            if results is not None:
                scan.results = json.dumps(results)
            db.commit()

        update(message="Checking for new jobs...")

        # Get already-seen URLs to deduplicate
        seen_urls = _get_seen_urls(db, user_id)

        all_jobs = await fetch_all_jobs(limit_per_source=AUTO_SCAN_LIMIT, sources=ALL_SOURCES)

        # Filter out already-seen jobs
        new_jobs = [j for j in all_jobs if j.url not in seen_urls]

        if not new_jobs:
            update(status="done", message="No new jobs since last scan", total=0, matched=0, results=[])
            # Still update last_auto_scan_at
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                user.last_auto_scan_at = datetime.now(timezone.utc)
                db.commit()
            return

        cv_keywords = _extract_cv_domain_words(cv_content)
        jobs = _keyword_prefilter(new_jobs, cv_keywords, max_jobs=80)
        update(total=len(jobs), message=f"Found {len(new_jobs)} new jobs, matching with your CV...")

        results = []
        batch_size = 8
        for i in range(0, len(jobs), batch_size):
            batch = jobs[i:i + batch_size]
            scores = await asyncio.gather(*[match_job(job, cv_content, ai_client, ai_model) for job in batch])
            for job, score_data in zip(batch, scores):
                if score_data["score"] == -1:
                    continue
                results.append({
                    "id": job.id, "title": job.title, "company": job.company,
                    "url": job.url, "region": job.region, "region_group": job.region_group,
                    "job_type": job.job_type, "experience_level": job.experience_level,
                    "score": score_data["score"], "reason": score_data["reason"],
                    "description": job.description[:500], "source": job.source,
                })

            sorted_so_far = sorted(results, key=lambda x: x["score"], reverse=True)
            update(matched=len(results), results=sorted_so_far)
            if i + batch_size < len(jobs):
                await asyncio.sleep(1)

        # Save ALL scanned jobs to seen_jobs (even low-score ones — so we don't re-scan them)
        all_scanned = [{
            "url": j.url, "score": next(
                (r["score"] for r in results if r["url"] == j.url), 0
            )
        } for j in jobs]
        _save_seen_jobs(db, user_id, all_scanned)

        # Update last_auto_scan_at
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.last_auto_scan_at = datetime.now(timezone.utc)
            db.commit()

        final = sorted(results, key=lambda x: x["score"], reverse=True)
        new_matches = [r for r in final if r["score"] >= FEED_SCORE_THRESHOLD]
        update(status="done", matched=len(final), results=final,
               message=f"Done — {len(new_matches)} new matches found")

    except Exception as e:
        scan = db.query(ScanJob).filter(ScanJob.id == scan_id).first()
        if scan:
            scan.status = "error"
            scan.message = str(e)
            db.commit()
    finally:
        db.close()


async def _run_scan(
    scan_id: str,
    cv_content: str,
    sources: list[str],
    custom_urls: list[str],
    limit_per_source: int,
    ai_client,
    ai_model: str,
):
    """Background task — runs independently of HTTP connection."""
    db = SessionLocal()
    try:
        def update(status=None, message=None, total=None, matched=None, results=None):
            scan = db.query(ScanJob).filter(ScanJob.id == scan_id).first()
            if not scan:
                return
            if status:
                scan.status = status
            if message:
                scan.message = message
            if total is not None:
                scan.total = total
            if matched is not None:
                scan.matched = matched
            if results is not None:
                scan.results = json.dumps(results)
            db.commit()

        source_labels = {"wwr": "WeWorkRemotely", "remoteok": "RemoteOK", "remotive": "Remotive"}
        active = [source_labels.get(s, s) for s in sources]
        sources_str = ", ".join(active)
        update(message=f"Fetching jobs from {sources_str}...")

        all_jobs = await fetch_all_jobs(
            limit_per_source=min(limit_per_source, 50),
            sources=sources,
            custom_urls=custom_urls,
        )

        cv_keywords = _extract_cv_domain_words(cv_content)
        jobs = _keyword_prefilter(all_jobs, cv_keywords, max_jobs=80)
        skipped = len(all_jobs) - len(jobs)

        msg = f"Found {len(all_jobs)} jobs"
        if skipped > 0:
            msg += f", pre-filtered to {len(jobs)} relevant"
        msg += ". Matching with your CV..."
        update(total=len(jobs), message=msg)

        results = []
        batch_size = 8
        for i in range(0, len(jobs), batch_size):
            batch = jobs[i:i + batch_size]
            scores = await asyncio.gather(*[match_job(job, cv_content, ai_client, ai_model) for job in batch])

            for job, score_data in zip(batch, scores):
                if score_data["score"] == -1:
                    continue
                results.append({
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
                })

            # Save progress after each batch so frontend can poll partial results
            sorted_so_far = sorted(results, key=lambda x: x["score"], reverse=True)
            update(matched=len(results), results=sorted_so_far)

            if i + batch_size < len(jobs):
                await asyncio.sleep(1)

        final = sorted(results, key=lambda x: x["score"], reverse=True)
        update(status="done", matched=len(final), results=final, message=f"Done — {len(final)} jobs matched")

    except Exception as e:
        db.query(ScanJob).filter(ScanJob.id == scan_id).first()
        scan = db.query(ScanJob).filter(ScanJob.id == scan_id).first()
        if scan:
            scan.status = "error"
            scan.message = str(e)
            db.commit()
    finally:
        db.close()


@router.post("/auto")
async def auto_scan(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trigger auto-scan if cooldown has passed. Returns cached status otherwise."""
    now = datetime.now(timezone.utc)
    last = current_user.last_auto_scan_at
    if last:
        # Make tz-aware if naive
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        elapsed_hours = (now - last).total_seconds() / 3600
        if elapsed_hours < AUTO_SCAN_COOLDOWN_HOURS:
            next_in = int((AUTO_SCAN_COOLDOWN_HOURS - elapsed_hours) * 60)
            return {"status": "cached", "next_scan_in_minutes": next_in}

    cvs = db.query(CV).filter(CV.user_id == current_user.id).all()
    if not cvs:
        return {"status": "no_cv"}

    cv_content = cvs[0].content
    ai_client, ai_model, _ = _get_ai_client(current_user)

    scan_id = str(uuid.uuid4())
    scan = ScanJob(id=scan_id, user_id=current_user.id, status="running", message="Checking for new jobs...")
    db.add(scan)
    db.commit()

    background_tasks.add_task(
        _run_auto_scan,
        scan_id=scan_id,
        user_id=current_user.id,
        cv_content=cv_content,
        ai_client=ai_client,
        ai_model=ai_model,
    )

    return {"status": "scanning", "scan_id": scan_id}


@router.get("/feed")
def get_feed(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get today's accumulated matched jobs from auto-scans."""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    four_hours_ago = datetime.now(timezone.utc) - timedelta(hours=4)

    seen = db.query(SeenJob).filter(
        SeenJob.user_id == current_user.id,
        SeenJob.score >= FEED_SCORE_THRESHOLD,
        SeenJob.first_seen_at >= today_start,
    ).order_by(SeenJob.score.desc()).all()

    # Pull full job data from the latest scan results for jobs in feed
    latest_scan = db.query(ScanJob).filter(
        ScanJob.user_id == current_user.id,
        ScanJob.status == "done",
    ).order_by(ScanJob.created_at.desc()).first()

    all_results: list[dict] = []
    if latest_scan:
        all_results = json.loads(latest_scan.results or "[]")

    # Build feed from seen_jobs, enrich with full data if available
    seen_urls = {s.job_url for s in seen}
    results_by_url = {r["url"]: r for r in all_results if r.get("url") in seen_urls}

    feed = []
    for s in seen:
        job_data = results_by_url.get(s.job_url)
        if job_data:
            job_data["is_new"] = s.first_seen_at >= four_hours_ago
            feed.append(job_data)

    last = current_user.last_auto_scan_at
    if last and last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    next_scan_in = None
    if last:
        elapsed = (datetime.now(timezone.utc) - last).total_seconds() / 3600
        remaining = AUTO_SCAN_COOLDOWN_HOURS - elapsed
        next_scan_in = max(0, int(remaining * 60))

    return {
        "jobs": feed,
        "total_today": len(seen),
        "new_count": sum(1 for s in seen if s.first_seen_at >= four_hours_ago),
        "last_scan_at": last.isoformat() if last else None,
        "next_scan_in_minutes": next_scan_in,
    }


@router.post("/start")
async def start_scan(
    background_tasks: BackgroundTasks,
    cv_id: int = 0,
    sources: Annotated[list[str], Query()] = ["wwr", "remoteok", "remotive", "jobicy", "arbeitnow"],
    custom_urls: Annotated[list[str], Query()] = [],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start a hard scan (100/source). Returns scan_id immediately."""
    cvs = db.query(CV).filter(CV.user_id == current_user.id).all()
    if not cvs:
        raise HTTPException(status_code=400, detail="No CVs found. Please add a CV first.")

    cv = next((c for c in cvs if c.id == cv_id), cvs[0])
    cv_content = cv.content
    ai_client, ai_model, _ = _get_ai_client(current_user)

    scan_id = str(uuid.uuid4())
    scan = ScanJob(id=scan_id, user_id=current_user.id, status="running", message="Starting deep scan...")
    db.add(scan)
    db.commit()

    background_tasks.add_task(
        _run_scan,
        scan_id=scan_id,
        cv_content=cv_content,
        sources=list(sources),
        custom_urls=list(custom_urls),
        limit_per_source=HARD_SCAN_LIMIT,
        ai_client=ai_client,
        ai_model=ai_model,
    )

    return {"scan_id": scan_id}


@router.get("/status/{scan_id}")
def get_scan_status(
    scan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Poll scan progress and partial results."""
    scan = db.query(ScanJob).filter(
        ScanJob.id == scan_id,
        ScanJob.user_id == current_user.id,
    ).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    return {
        "scan_id": scan_id,
        "status": scan.status,
        "total": scan.total,
        "matched": scan.matched,
        "message": scan.message,
        "results": json.loads(scan.results or "[]"),
    }


@router.get("/latest")
def get_latest_scan(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the most recent scan for this user."""
    scan = db.query(ScanJob).filter(
        ScanJob.user_id == current_user.id,
    ).order_by(ScanJob.created_at.desc()).first()

    if not scan:
        return {"scan_id": None, "status": "none"}

    return {
        "scan_id": scan.id,
        "status": scan.status,
        "total": scan.total,
        "matched": scan.matched,
        "message": scan.message,
        "results": json.loads(scan.results or "[]"),
    }
