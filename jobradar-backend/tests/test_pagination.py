"""Tests for Phase 2: pagination on list endpoints."""
import pytest

JD = "Software Engineer — Remote. Python, React, TypeScript."


@pytest.fixture
def many_jobs(client, user_with_cv):
    headers = user_with_cv
    for i in range(5):
        client.post("/api/jobs/", json={"raw_jd": JD, "title": f"Job {i}"}, headers=headers)
    return headers


def test_jobs_default_limit(client, many_jobs):
    r = client.get("/api/jobs/", headers=many_jobs)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) == 5  # all 5 created


def test_jobs_limit(client, many_jobs):
    r = client.get("/api/jobs/?limit=2", headers=many_jobs)
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_jobs_skip(client, many_jobs):
    all_jobs = client.get("/api/jobs/", headers=many_jobs).json()
    skipped = client.get("/api/jobs/?skip=2", headers=many_jobs).json()
    assert len(skipped) == len(all_jobs) - 2


def test_jobs_limit_too_large(client, many_jobs):
    r = client.get("/api/jobs/?limit=501", headers=many_jobs)
    assert r.status_code == 422  # exceeds max


def test_jobs_negative_skip(client, many_jobs):
    r = client.get("/api/jobs/?skip=-1", headers=many_jobs)
    assert r.status_code == 422


def test_cvs_limit(client, registered_user):
    headers = registered_user
    for i in range(3):
        client.post("/api/cvs/", json={"name": f"CV {i}", "content": "Python developer"}, headers=headers)
    r = client.get("/api/cvs/?limit=2", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_applications_limit(client, user_with_cv):
    headers = user_with_cv
    cv = client.get("/api/cvs/", headers=headers).json()[0]
    for i in range(4):
        job = client.post("/api/jobs/", json={"raw_jd": JD, "title": f"App Job {i}"}, headers=headers).json()
        client.post("/api/applications/", json={"job_id": job["id"], "cv_id": cv["id"]}, headers=headers)

    r = client.get("/api/applications/?limit=2", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_applications_skip_and_limit(client, user_with_cv):
    headers = user_with_cv
    cv = client.get("/api/cvs/", headers=headers).json()[0]
    for i in range(4):
        job = client.post("/api/jobs/", json={"raw_jd": JD, "title": f"Skip Job {i}"}, headers=headers).json()
        client.post("/api/applications/", json={"job_id": job["id"], "cv_id": cv["id"]}, headers=headers)

    all_apps = client.get("/api/applications/", headers=headers).json()
    page2 = client.get("/api/applications/?skip=2&limit=2", headers=headers).json()
    # IDs should differ from first 2
    first2_ids = {a["id"] for a in all_apps[:2]}
    page2_ids = {a["id"] for a in page2}
    assert first2_ids.isdisjoint(page2_ids)
