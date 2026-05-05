JD_SAMPLE = """
Software Engineer - Full Stack
Company: TechCorp
Location: Remote

Requirements:
- 2+ years Python, FastAPI
- React, TypeScript experience
- PostgreSQL, Docker
- Salary: $80k-$100k
"""


def test_create_job(client, registered_user):
    r = client.post("/api/jobs/", json={"raw_jd": JD_SAMPLE, "title": "Software Engineer"}, headers=registered_user)
    assert r.status_code in (200, 201)
    data = r.json()
    assert "id" in data


def test_list_jobs(client, registered_user):
    client.post("/api/jobs/", json={"raw_jd": JD_SAMPLE, "title": "Engineer"}, headers=registered_user)
    r = client.get("/api/jobs/", headers=registered_user)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) >= 1


def test_get_job(client, registered_user):
    job = client.post("/api/jobs/", json={"raw_jd": JD_SAMPLE, "title": "Dev"}, headers=registered_user).json()
    r = client.get(f"/api/jobs/{job['id']}", headers=registered_user)
    assert r.status_code == 200
    assert r.json()["id"] == job["id"]


def test_delete_job(client, registered_user):
    job = client.post("/api/jobs/", json={"raw_jd": "temp jd", "title": "Temp"}, headers=registered_user).json()
    d = client.delete(f"/api/jobs/{job['id']}", headers=registered_user)
    assert d.status_code in (200, 204)
    assert client.get(f"/api/jobs/{job['id']}", headers=registered_user).status_code == 404


def test_job_requires_auth(client):
    assert client.get("/api/jobs/").status_code in (401, 403)


def test_job_isolation(client):
    """User A cannot see User B's jobs."""
    client.post("/api/auth/register", json={"email": "jobuser_b@test.dev", "password": "Pass1234!", "full_name": "B"})
    rb = client.post("/api/auth/login", json={"email": "jobuser_b@test.dev", "password": "Pass1234!"})
    hb = {"Authorization": f"Bearer {rb.json()['access_token']}"}
    job = client.post("/api/jobs/", json={"raw_jd": JD_SAMPLE, "title": "B Job"}, headers=hb).json()

    client.post("/api/auth/register", json={"email": "jobuser_a@test.dev", "password": "Pass1234!", "full_name": "A"})
    ra = client.post("/api/auth/login", json={"email": "jobuser_a@test.dev", "password": "Pass1234!"})
    ha = {"Authorization": f"Bearer {ra.json()['access_token']}"}

    assert client.get(f"/api/jobs/{job['id']}", headers=ha).status_code == 404
