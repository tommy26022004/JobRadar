"""Tests for Phase 4c: notification settings endpoint."""


def test_get_notification_settings_default(client, registered_user):
    r = client.get("/api/settings/notifications", headers=registered_user)
    assert r.status_code == 200
    data = r.json()
    assert "email_notifications" in data
    assert data["email_notifications"] is True  # default on
    assert "email" in data


def test_disable_notifications(client, registered_user):
    r = client.put("/api/settings/notifications", json={"email_notifications": False}, headers=registered_user)
    assert r.status_code == 200
    assert r.json()["email_notifications"] is False

    # Verify persisted
    r2 = client.get("/api/settings/notifications", headers=registered_user)
    assert r2.json()["email_notifications"] is False


def test_re_enable_notifications(client, registered_user):
    # Disable first
    client.put("/api/settings/notifications", json={"email_notifications": False}, headers=registered_user)
    # Re-enable
    r = client.put("/api/settings/notifications", json={"email_notifications": True}, headers=registered_user)
    assert r.status_code == 200
    assert r.json()["email_notifications"] is True


def test_notification_settings_requires_auth(client):
    assert client.get("/api/settings/notifications").status_code in (401, 403)
    assert client.put("/api/settings/notifications", json={"email_notifications": False}).status_code in (401, 403)


def test_notification_settings_invalid_payload(client, registered_user):
    r = client.put("/api/settings/notifications", json={"email_notifications": "yes"}, headers=registered_user)
    # "yes" is not a bool → 422
    assert r.status_code == 422
