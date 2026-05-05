def test_register(client):
    r = client.post("/api/auth/register", json={
        "email": "newuser@test.dev",
        "password": "Pass1234!",
        "full_name": "New User",
    })
    assert r.status_code in (200, 201)
    assert "access_token" in r.json()


def test_register_duplicate_email(client, registered_user):
    r = client.post("/api/auth/register", json={
        "email": "test@jobradar.dev",
        "password": "Pass1234!",
        "full_name": "Dupe",
    })
    assert r.status_code == 400


def test_login_success(client):
    client.post("/api/auth/register", json={
        "email": "login@test.dev",
        "password": "Pass1234!",
        "full_name": "Login User",
    })
    r = client.post("/api/auth/login", json={
        "email": "login@test.dev",
        "password": "Pass1234!",
    })
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_login_wrong_password(client):
    client.post("/api/auth/register", json={
        "email": "wrongpass@test.dev",
        "password": "Correct1!",
        "full_name": "User",
    })
    r = client.post("/api/auth/login", json={
        "email": "wrongpass@test.dev",
        "password": "WrongPass!",
    })
    assert r.status_code == 401


def test_me_authenticated(client, registered_user):
    r = client.get("/api/auth/me", headers=registered_user)
    assert r.status_code == 200
    assert r.json()["email"] == "test@jobradar.dev"


def test_me_unauthenticated(client):
    r = client.get("/api/auth/me")
    assert r.status_code in (401, 403)
