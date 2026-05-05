from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, cvs, jobs, applications, analyze, discover, settings, dashboard

app = FastAPI(title="JobRadar API", version="1.0.0")

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
    return {"status": "ok"}
