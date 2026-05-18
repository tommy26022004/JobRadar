from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.limiter import limiter
from app.api import auth, cvs, jobs, applications, analyze, discover, settings, dashboard
from app.core.database import SessionLocal
from app.models.scan import ScanJob
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)



@asynccontextmanager
async def lifespan(app: FastAPI):
    # Mark any scans left as "running" (from a previous crashed process) as error
    db = SessionLocal()
    try:
        db.query(ScanJob).filter(ScanJob.status == "running").update(
            {"status": "error", "message": "Server restarted — scan was interrupted"}
        )
        db.commit()
    finally:
        db.close()
    yield


app = FastAPI(title="JobRadar API", version="1.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

import os

_raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
_origins = [o.strip() for o in _raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(cvs.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(applications.router, prefix="/api")
app.include_router(analyze.router, prefix="/api")
app.include_router(discover.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")


@app.get("/health")
def health_check():
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        db.execute(__import__("sqlalchemy").text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "error"
    finally:
        db.close()
    return {"status": "ok", "db": db_status, "version": "1.0.0"}
