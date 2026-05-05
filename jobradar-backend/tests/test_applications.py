import pytest

JD = "Senior Python Developer — Remote. Requirements: Python, FastAPI, PostgreSQL, 3+ years."


@pytest.fixture
def job_and_cv(client, user_with_cv):
    job = client.post("/api/jobs/", json={"raw_jd": JD, "title": "Python Dev"}, headers=user_with_cv).json()
    cv = client.get("/api/cvs/", headers=user_with_cv).json()[0]
    return job, cv, user_with_cv


def test_create_application(client, job_and_cv):
    job, cv, headers = job_and_cv
    r = client.post("/api/applications/", json={"job_id": job["id"], "cv_id": cv["id"]}, headers=headers)
    assert r.status_code in (200, 201)
    data = r.json()
    assert data["job_id"] == job["id"]
    assert data["status"] == "saved"


def test_list_applications(client, job_and_cv):
    job, cv, headers = job_and_cv
    client.post("/api/applications/", json={"job_id": job["id"], "cv_id": cv["id"]}, headers=headers)
    r = client.get("/api/applications/", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_update_application_status(client, job_and_cv):
    job, cv, headers = job_and_cv
    app = client.post("/api/applications/", json={"job_id": job["id"], "cv_id": cv["id"]}, headers=headers).json()
    r = client.patch(f"/api/applications/{app['id']}", json={"status": "applied"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "applied"


def test_application_status_values(client, job_and_cv):
    """All valid statuses should be accepted."""
    job, cv, headers = job_and_cv
    for status in ["saved", "applied", "interview", "offer", "rejected"]:
        app = client.post("/api/applications/", json={"job_id": job["id"], "cv_id": cv["id"]}, headers=headers).json()
        r = client.patch(f"/api/applications/{app['id']}", json={"status": status}, headers=headers)
        assert r.status_code == 200, f"Status '{status}' rejected"


def test_delete_application(client, job_and_cv):
    job, cv, headers = job_and_cv
    app = client.post("/api/applications/", json={"job_id": job["id"], "cv_id": cv["id"]}, headers=headers).json()
    d = client.delete(f"/api/applications/{app['id']}", headers=headers)
    assert d.status_code in (200, 204)


def test_application_requires_auth(client):
    assert client.get("/api/applications/").status_code in (401, 403)
