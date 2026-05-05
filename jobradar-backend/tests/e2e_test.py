"""
E2E test — chạy bằng: python tests/e2e_test.py
Yêu cầu: backend đang chạy tại http://localhost:8000
"""
import httpx
import json
import sys

BASE = "http://localhost:8000/api"

SAMPLE_JD = """
Software Engineer — Backend (Remote)
Company: TechCorp Inc.

We are looking for a Backend Engineer to join our team.

Requirements:
- 2+ years of experience with Python
- Experience with FastAPI or Django
- PostgreSQL or MySQL database experience
- Familiarity with Docker and containerization
- RESTful API design
- Basic knowledge of cloud platforms (AWS or GCP)

Nice to have:
- LangChain or LangGraph experience
- Experience with Redis
- CI/CD pipelines

Salary: $80,000 - $110,000/year
Location: Remote
"""

SAMPLE_CV = """
Tran Quang Dat — Software Engineer

Skills:
- Python, Java, TypeScript, JavaScript
- FastAPI, Spring Boot, Spring WebFlux
- PostgreSQL, MySQL, Redis, DynamoDB
- Docker, microservices, AWS Lambda, AWS Amplify
- LangGraph, LLM integration, Amazon Bedrock

Experience:
- Software Engineering Intern at Kollect Systems (Jan-Apr 2026)
  - Built JWT authentication system
  - Developed AI analytics agent using LangGraph
  - Implemented GDPR-compliant data subject access requests
  - Created dashboard widgets with real-time data

Projects:
- wAI Counselling Assistant: Serverless chatbot using AWS Lambda, Bedrock, Amplify
- SmartQuiz: Full-stack quiz platform with OAuth, CRUD, role-based access, PDF reports
- Tech Stock Portfolio Analysis: Python-based portfolio optimization tool

Education:
- Bachelor of IT (FinTech), Asia Pacific University, graduating 2027
"""


def check(label: str, condition: bool, detail: str = ""):
    if condition:
        print(f"  [PASS] {label}")
    else:
        print(f"  [FAIL] {label} {detail}")
        sys.exit(1)


def run():
    print("\n=== JobRadar E2E Test ===\n")

    with httpx.Client(timeout=60) as client:
        # 1. Register
        print("1. Register user")
        r = client.post(f"{BASE}/auth/register", json={
            "email": "e2etest@jobradar.com",
            "password": "testpass123",
            "full_name": "E2E Tester"
        })
        if r.status_code == 400 and "already registered" in r.text:
            print("  [SKIP] User already exists, logging in instead")
            r = client.post(f"{BASE}/auth/login", json={
                "email": "e2etest@jobradar.com",
                "password": "testpass123"
            })
        check("Auth returns 200/201", r.status_code in (200, 201), r.text)
        tokens = r.json()
        check("Has access_token", "access_token" in tokens)
        token = tokens["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print()

        # 2. Create CV
        print("2. Create CV")
        r = client.post(f"{BASE}/cvs/", json={"name": "Backend CV", "content": SAMPLE_CV}, headers=headers)
        check("CV created (201)", r.status_code == 201, r.text)
        cv_id = r.json()["id"]
        check("CV has id", cv_id > 0)
        print()

        # 3. Analyze JD (streaming)
        print("3. Analyze JD with AI pipeline (streaming)")
        print("   Waiting for Gemini... (may take 20-40s)")
        events = []
        with client.stream("POST", f"{BASE}/analyze/", json={
            "raw_jd": SAMPLE_JD,
            "cv_id": cv_id,
            "title": "Backend Engineer",
            "company": "TechCorp Inc.",
        }, headers=headers) as resp:
            check("Stream starts (200)", resp.status_code == 200, str(resp.status_code))
            for line in resp.iter_lines():
                if line.startswith("data:"):
                    data = json.loads(line[5:].strip())
                    events.append(data)
                    print(f"   [event] {data.get('event')} ", end="")
                    if data.get("event") == "parsed":
                        print(f"→ {data.get('title')} @ {data.get('company')}")
                    elif data.get("event") == "matched":
                        print(f"→ score: {data.get('score')}/100")
                    elif data.get("event") == "suggested":
                        print(f"→ {len(data.get('suggestions', ''))} chars of suggestions")
                    elif data.get("event") == "saved":
                        print(f"→ job_id={data.get('job_id')}, app_id={data.get('application_id')}")
                    else:
                        print()

        event_names = [e.get("event") for e in events]
        check("Got 'start' event", "start" in event_names)
        check("Got 'parsed' event", "parsed" in event_names)
        check("Got 'matched' event", "matched" in event_names)
        check("Got 'suggested' event", "suggested" in event_names)
        check("Got 'done' event", "done" in event_names)
        check("Got 'saved' event", "saved" in event_names)

        matched = next(e for e in events if e.get("event") == "matched")
        check("Match score is 0-100", 0 <= matched.get("score", -1) <= 100)
        check("Analysis not empty", len(matched.get("analysis", "")) > 10)

        saved = next(e for e in events if e.get("event") == "saved")
        job_id = saved["job_id"]
        app_id = saved["application_id"]
        print()

        # 4. Verify data persisted in DB
        print("4. Verify data saved to DB")
        r = client.get(f"{BASE}/jobs/{job_id}", headers=headers)
        check("Job retrievable", r.status_code == 200, r.text)
        job = r.json()
        check("Job has parsed_title", bool(job.get("parsed_title")))
        check("Job has parsed_stack", bool(job.get("parsed_stack")))

        r = client.get(f"{BASE}/applications/{app_id}", headers=headers)
        check("Application retrievable", r.status_code == 200, r.text)
        app = r.json()
        check("Application has match_score", app.get("match_score") is not None)
        check("Application has ai_analysis", bool(app.get("ai_analysis")))
        check("Application has cv_suggestions", bool(app.get("cv_suggestions")))
        print()

        # 5. Update application status (Kanban)
        print("5. Update application status (Kanban)")
        r = client.patch(f"{BASE}/applications/{app_id}", json={"status": "applied"}, headers=headers)
        check("Status updated (200)", r.status_code == 200, r.text)
        check("Status is 'applied'", r.json().get("status") == "applied")
        print()

    print("=== All tests passed! ===\n")


if __name__ == "__main__":
    run()
