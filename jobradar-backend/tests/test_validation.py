"""Tests for Phase 1 security: input validation, token types, rate limiting."""
import pytest


# ── Password validation ──────────────────────────────────────────────────────

def test_register_password_too_short(client):
    r = client.post("/api/auth/register", json={
        "email": "short@test.dev", "password": "Ab1", "full_name": "User",
    })
    assert r.status_code == 422


def test_register_password_no_uppercase(client):
    r = client.post("/api/auth/register", json={
        "email": "noupper@test.dev", "password": "lowercase1234", "full_name": "User",
    })
    assert r.status_code == 422


def test_register_password_no_digit(client):
    r = client.post("/api/auth/register", json={
        "email": "nodigit@test.dev", "password": "NoDigitHere!", "full_name": "User",
    })
    assert r.status_code == 422


def test_register_valid_password(client):
    r = client.post("/api/auth/register", json={
        "email": "valid@test.dev", "password": "ValidPass1", "full_name": "User",
    })
    assert r.status_code in (200, 201)
    assert "access_token" in r.json()


def test_register_full_name_too_long(client):
    r = client.post("/api/auth/register", json={
        "email": "longname@test.dev",
        "password": "ValidPass1",
        "full_name": "A" * 101,
    })
    assert r.status_code == 422


# ── CV content validation ────────────────────────────────────────────────────

def test_cv_content_too_long(client, registered_user):
    r = client.post("/api/cvs/", json={
        "name": "Big CV",
        "content": "x" * 100_001,
    }, headers=registered_user)
    assert r.status_code == 422


def test_cv_name_too_long(client, registered_user):
    r = client.post("/api/cvs/", json={
        "name": "N" * 101,
        "content": "Valid content here",
    }, headers=registered_user)
    assert r.status_code == 422


def test_cv_empty_content_rejected(client, registered_user):
    r = client.post("/api/cvs/", json={
        "name": "Empty CV",
        "content": "",
    }, headers=registered_user)
    assert r.status_code == 422


# ── raw_jd validation ────────────────────────────────────────────────────────

def test_analyze_raw_jd_too_long(client, user_with_cv):
    cv_id = client.get("/api/cvs/", headers=user_with_cv).json()[0]["id"]
    r = client.post("/api/analyze/", json={
        "raw_jd": "x" * 50_001,
        "cv_id": cv_id,
    }, headers=user_with_cv)
    assert r.status_code == 422


def test_analyze_empty_raw_jd_rejected(client, user_with_cv):
    cv_id = client.get("/api/cvs/", headers=user_with_cv).json()[0]["id"]
    r = client.post("/api/analyze/", json={
        "raw_jd": "",
        "cv_id": cv_id,
    }, headers=user_with_cv)
    assert r.status_code == 422


# ── Token type validation ────────────────────────────────────────────────────

def test_refresh_token_cannot_be_used_as_access_token(client):
    """A refresh token submitted as Bearer should fail protected endpoints."""
    client.post("/api/auth/register", json={
        "email": "tokentest@test.dev", "password": "TokenPass1", "full_name": "T",
    })
    login = client.post("/api/auth/login", json={
        "email": "tokentest@test.dev", "password": "TokenPass1",
    }).json()
    refresh_token = login["refresh_token"]

    # Try using refresh token as access token
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {refresh_token}"})
    assert r.status_code in (401, 403)


def test_refresh_endpoint_accepts_refresh_token(client):
    client.post("/api/auth/register", json={
        "email": "refreshok@test.dev", "password": "RefreshPass1", "full_name": "R",
    })
    login = client.post("/api/auth/login", json={
        "email": "refreshok@test.dev", "password": "RefreshPass1",
    }).json()
    r = client.post("/api/auth/refresh", json={"refresh_token": login["refresh_token"]})
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_refresh_endpoint_rejects_access_token(client):
    client.post("/api/auth/register", json={
        "email": "refreshbad@test.dev", "password": "BadRefresh1", "full_name": "R",
    })
    login = client.post("/api/auth/login", json={
        "email": "refreshbad@test.dev", "password": "BadRefresh1",
    }).json()
    # Use access_token where refresh_token is expected
    r = client.post("/api/auth/refresh", json={"refresh_token": login["access_token"]})
    assert r.status_code == 401


# ── Health check ─────────────────────────────────────────────────────────────

def test_health_check(client):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert "version" in data
