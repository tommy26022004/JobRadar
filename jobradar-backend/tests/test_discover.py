from unittest.mock import patch, AsyncMock
from app.agents.rss_fetcher import RemoteJob
from tests.conftest import override_get_db

MOCK_JOBS = [
    RemoteJob(id="job1", title="Senior Python Developer", company="TechCorp", url="https://example.com/1",
              description="Python FastAPI PostgreSQL Docker 3+ years experience required", region="Worldwide",
              source="WeWorkRemotely", job_type="full-time", region_group="Worldwide", experience_level="senior"),
    RemoteJob(id="job2", title="React Frontend Engineer", company="StartupXYZ", url="https://example.com/2",
              description="React TypeScript Next.js experience needed", region="Asia-Pacific",
              source="RemoteOK", job_type="full-time", region_group="Asia-Pacific", experience_level="mid"),
]


def test_discover_requires_cv(client, registered_user):
    """Should fail if no CV uploaded."""
    r = client.post("/api/discover/start", headers=registered_user)
    assert r.status_code == 400
    assert "CV" in r.json()["detail"]


def test_discover_start_returns_scan_id(client, user_with_cv):
    with patch("app.api.discover.fetch_all_jobs", new_callable=AsyncMock, return_value=MOCK_JOBS), \
         patch("app.api.discover.match_job", new_callable=AsyncMock, return_value={"score": 75, "reason": "Good match"}):
        r = client.post("/api/discover/start", headers=user_with_cv)
    assert r.status_code == 200
    assert "scan_id" in r.json()


def test_discover_status(client, user_with_cv):
    with patch("app.api.discover.fetch_all_jobs", new_callable=AsyncMock, return_value=MOCK_JOBS), \
         patch("app.api.discover.match_job", new_callable=AsyncMock, return_value={"score": 75, "reason": "Good match"}):
        scan_id = client.post("/api/discover/start", headers=user_with_cv).json()["scan_id"]

    r = client.get(f"/api/discover/status/{scan_id}", headers=user_with_cv)
    assert r.status_code == 200
    data = r.json()
    assert data["scan_id"] == scan_id
    assert data["status"] in ("running", "done", "error")


def test_discover_status_not_found(client, registered_user):
    r = client.get("/api/discover/status/nonexistent-id", headers=registered_user)
    assert r.status_code == 404


def test_discover_latest_no_scans(client, registered_user):
    r = client.get("/api/discover/latest", headers=registered_user)
    assert r.status_code == 200
    assert r.json()["status"] == "none"


def test_discover_latest_returns_most_recent(client, user_with_cv):
    with patch("app.api.discover.fetch_all_jobs", new_callable=AsyncMock, return_value=MOCK_JOBS), \
         patch("app.api.discover.match_job", new_callable=AsyncMock, return_value={"score": 60, "reason": "Ok"}):
        client.post("/api/discover/start", headers=user_with_cv)

    r = client.get("/api/discover/latest", headers=user_with_cv)
    assert r.status_code == 200
    assert r.json()["scan_id"] is not None


def test_auto_scan_no_cv(client, registered_user):
    r = client.post("/api/discover/auto", headers=registered_user)
    assert r.status_code == 200
    assert r.json()["status"] == "no_cv"


def test_auto_scan_triggers_on_first_call(client, user_with_cv):
    with patch("app.api.discover.fetch_all_jobs", new_callable=AsyncMock, return_value=MOCK_JOBS), \
         patch("app.api.discover.match_job", new_callable=AsyncMock, return_value={"score": 55, "reason": "Decent"}):
        r = client.post("/api/discover/auto", headers=user_with_cv)
    assert r.status_code == 200
    assert r.json()["status"] in ("scanning", "no_cv")


def test_auto_scan_cooldown(client, user_with_cv):
    """After scan runs, last_auto_scan_at is set → next call returns cached."""
    from datetime import datetime, timezone
    from app.core.database import get_db
    from app.models.user import User

    # Force last_auto_scan_at to now in DB so cooldown triggers
    db = next(override_get_db())
    try:
        user = db.query(User).first()
        if user:
            user.last_auto_scan_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()

    r = client.post("/api/discover/auto", headers=user_with_cv)
    assert r.status_code == 200
    assert r.json()["status"] == "cached"


def test_feed_empty_initially(client, registered_user):
    r = client.get("/api/discover/feed", headers=registered_user)
    assert r.status_code == 200
    data = r.json()
    assert "jobs" in data
    assert isinstance(data["jobs"], list)


def test_discover_requires_auth(client):
    assert client.post("/api/discover/start").status_code in (401, 403)
    assert client.get("/api/discover/latest").status_code in (401, 403)
    assert client.get("/api/discover/feed").status_code in (401, 403)
