def test_get_ai_settings_default(client, registered_user):
    r = client.get("/api/settings/ai", headers=registered_user)
    assert r.status_code == 200
    data = r.json()
    assert data["provider"] == "groq"
    assert data["model"] is None


def test_update_ai_provider(client, registered_user):
    r = client.put("/api/settings/ai", json={"provider": "openai", "model": "gpt-4o-mini", "api_key": "sk-test"}, headers=registered_user)
    assert r.status_code == 200
    assert "message" in r.json() or r.json().get("provider") == "openai"


def test_update_ai_provider_invalid(client, registered_user):
    r = client.put("/api/settings/ai", json={"provider": "unknown_provider"}, headers=registered_user)
    # Backend may return 400 or 422 depending on validation layer
    assert r.status_code in (400, 422)


def test_delete_ai_key(client, registered_user):
    client.put("/api/settings/ai", json={"provider": "groq", "api_key": "my-key"}, headers=registered_user)
    r = client.delete("/api/settings/ai", headers=registered_user)
    assert r.status_code == 200
    settings = client.get("/api/settings/ai", headers=registered_user).json()
    assert settings.get("has_custom_key") is False


def test_get_providers_list(client, registered_user):
    r = client.get("/api/settings/ai/providers", headers=registered_user)
    assert r.status_code == 200
    providers = r.json()
    # providers is a dict keyed by provider id
    assert "groq" in providers
    assert "openai" in providers


def test_settings_requires_auth(client):
    assert client.get("/api/settings/ai").status_code in (401, 403)
