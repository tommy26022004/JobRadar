"""Tests for Phase 4a: interview_at and notes on applications."""
import pytest
from datetime import datetime, timezone

JD = "Senior Python Developer — Remote. Requirements: Python, FastAPI, PostgreSQL."


@pytest.fixture
def app_fixture(client, user_with_cv):
    job = client.post("/api/jobs/", json={"raw_jd": JD, "title": "Python Dev"}, headers=user_with_cv).json()
    cv = client.get("/api/cvs/", headers=user_with_cv).json()[0]
    app = client.post("/api/applications/", json={"job_id": job["id"], "cv_id": cv["id"]}, headers=user_with_cv).json()
    return app, user_with_cv


def test_application_has_interview_at_field(client, app_fixture):
    app, headers = app_fixture
    r = client.get(f"/api/applications/{app['id']}", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "interview_at" in data
    assert data["interview_at"] is None  # null by default


def test_application_has_notes_field(client, app_fixture):
    app, headers = app_fixture
    r = client.get(f"/api/applications/{app['id']}", headers=headers)
    data = r.json()
    assert "notes" in data
    assert data["notes"] is None  # null by default


def test_set_interview_date(client, app_fixture):
    app, headers = app_fixture
    interview_time = "2026-06-15T14:00:00+00:00"
    r = client.patch(f"/api/applications/{app['id']}", json={"interview_at": interview_time}, headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["interview_at"] is not None
    # Should contain the date portion
    assert "2026-06-15" in data["interview_at"]


def test_set_notes(client, app_fixture):
    app, headers = app_fixture
    notes_text = "Good company culture. Ask about remote policy."
    r = client.patch(f"/api/applications/{app['id']}", json={"notes": notes_text}, headers=headers)
    assert r.status_code == 200
    assert r.json()["notes"] == notes_text


def test_clear_interview_date(client, app_fixture):
    app, headers = app_fixture
    # Set it first
    client.patch(f"/api/applications/{app['id']}", json={"interview_at": "2026-06-15T14:00:00+00:00"}, headers=headers)
    # Then clear it
    r = client.patch(f"/api/applications/{app['id']}", json={"interview_at": None}, headers=headers)
    assert r.status_code == 200
    assert r.json()["interview_at"] is None


def test_notes_max_length(client, app_fixture):
    app, headers = app_fixture
    r = client.patch(f"/api/applications/{app['id']}", json={"notes": "x" * 5001}, headers=headers)
    assert r.status_code == 422


def test_notes_and_interview_persist(client, app_fixture):
    app, headers = app_fixture
    notes = "Follow up on Monday"
    interview = "2026-07-01T10:00:00+00:00"
    client.patch(f"/api/applications/{app['id']}", json={"notes": notes, "interview_at": interview}, headers=headers)
    # Re-fetch to verify persistence
    r = client.get(f"/api/applications/{app['id']}", headers=headers)
    data = r.json()
    assert data["notes"] == notes
    assert "2026-07-01" in data["interview_at"]
