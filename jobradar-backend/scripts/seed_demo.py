"""
Seed a demo account for recruiters to test without registering.
Usage: python scripts/seed_demo.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine, Base
from app.models import User, CV, Job, Application
from app.core.security import get_password_hash

DEMO_EMAIL = "demo@jobradar.dev"
DEMO_PASSWORD = "Demo1234!"
DEMO_NAME = "Demo User"

DEMO_CV = """Full-Stack Software Engineer — 3 Years Experience

Skills: Python, FastAPI, React, TypeScript, PostgreSQL, Docker, AWS, REST APIs, Git

Experience:
- Backend Engineer @ TechStartup (2022–present): Built FastAPI microservices handling 50k req/day, PostgreSQL optimization, Docker/K8s deployment
- Junior Developer @ Agency (2021–2022): React frontend, Node.js APIs, MySQL

Education: BSc Computer Science, 2021

Languages: English (professional), Vietnamese (native)
"""

DEMO_JOBS = [
    {
        "title": "Senior Backend Engineer",
        "company": "RemoteCo",
        "raw_jd": "We need a Python/FastAPI engineer with PostgreSQL experience for our remote team.",
        "parsed_title": "Senior Backend Engineer",
        "parsed_company": "RemoteCo",
        "parsed_stack": "Python, FastAPI, PostgreSQL",
        "match_score": 88,
        "status": "interview",
    },
    {
        "title": "Full Stack Developer",
        "company": "StartupXYZ",
        "raw_jd": "React + Node.js full stack developer for a fast-growing SaaS startup.",
        "parsed_title": "Full Stack Developer",
        "parsed_company": "StartupXYZ",
        "parsed_stack": "React, TypeScript, Node.js",
        "match_score": 72,
        "status": "applied",
    },
    {
        "title": "Software Engineer",
        "company": "BigCorp",
        "raw_jd": "Looking for a software engineer with 3+ years experience in Python and cloud.",
        "parsed_title": "Software Engineer",
        "parsed_company": "BigCorp",
        "parsed_stack": "Python, AWS, Docker",
        "match_score": 65,
        "status": "saved",
    },
]


def seed():
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    try:
        existing = db.query(User).filter(User.email == DEMO_EMAIL).first()
        if existing:
            print(f"Demo account already exists: {DEMO_EMAIL}")
            return

        user = User(
            email=DEMO_EMAIL,
            full_name=DEMO_NAME,
            hashed_password=get_password_hash(DEMO_PASSWORD),
        )
        db.add(user)
        db.flush()

        cv = CV(user_id=user.id, name="My CV", content=DEMO_CV)
        db.add(cv)
        db.flush()

        for j in DEMO_JOBS:
            job = Job(
                user_id=user.id,
                raw_jd=j["raw_jd"],
                title=j["title"],
                company=j["company"],
                parsed_title=j["parsed_title"],
                parsed_company=j["parsed_company"],
                parsed_stack=j["parsed_stack"],
            )
            db.add(job)
            db.flush()

            app = Application(
                user_id=user.id,
                job_id=job.id,
                cv_id=cv.id,
                status=j["status"],
                match_score=j["match_score"],
            )
            db.add(app)

        db.commit()
        print(f"Demo account created: {DEMO_EMAIL} / {DEMO_PASSWORD}")

    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
