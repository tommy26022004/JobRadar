def test_create_cv(client, registered_user):
    r = client.post("/api/cvs/", json={
        "name": "My CV",
        "content": "Python developer 3 years experience FastAPI React",
    }, headers=registered_user)
    assert r.status_code in (200, 201)
    data = r.json()
    assert data["name"] == "My CV"
    assert "id" in data


def test_list_cvs(client, user_with_cv):
    r = client.get("/api/cvs/", headers=user_with_cv)
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_get_cv(client, user_with_cv):
    cvs = client.get("/api/cvs/", headers=user_with_cv).json()
    cv_id = cvs[0]["id"]
    r = client.get(f"/api/cvs/{cv_id}", headers=user_with_cv)
    assert r.status_code == 200
    assert r.json()["id"] == cv_id


def test_update_cv(client, user_with_cv):
    cvs = client.get("/api/cvs/", headers=user_with_cv).json()
    cv_id = cvs[0]["id"]
    r = client.patch(f"/api/cvs/{cv_id}", json={"name": "Updated CV", "content": "updated content"}, headers=user_with_cv)
    assert r.status_code == 200
    assert r.json()["name"] == "Updated CV"


def test_delete_cv(client, registered_user):
    r = client.post("/api/cvs/", json={"name": "To Delete", "content": "temp"}, headers=registered_user)
    cv_id = r.json()["id"]
    d = client.delete(f"/api/cvs/{cv_id}", headers=registered_user)
    assert d.status_code in (200, 204)
    # Confirm gone
    get = client.get(f"/api/cvs/{cv_id}", headers=registered_user)
    assert get.status_code == 404


def test_cv_requires_auth(client):
    r = client.get("/api/cvs/")
    assert r.status_code in (401, 403)


def test_cv_isolation(client):
    """User A cannot access User B's CVs."""
    client.post("/api/auth/register", json={"email": "userb@test.dev", "password": "Pass1234!", "full_name": "B"})
    rb = client.post("/api/auth/login", json={"email": "userb@test.dev", "password": "Pass1234!"})
    headers_b = {"Authorization": f"Bearer {rb.json()['access_token']}"}

    # User B creates a CV
    cv = client.post("/api/cvs/", json={"name": "B CV", "content": "B content"}, headers=headers_b).json()

    # Register user A and try to access B's CV
    client.post("/api/auth/register", json={"email": "usera@test.dev", "password": "Pass1234!", "full_name": "A"})
    ra = client.post("/api/auth/login", json={"email": "usera@test.dev", "password": "Pass1234!"})
    headers_a = {"Authorization": f"Bearer {ra.json()['access_token']}"}

    r = client.get(f"/api/cvs/{cv['id']}", headers=headers_a)
    assert r.status_code == 404
