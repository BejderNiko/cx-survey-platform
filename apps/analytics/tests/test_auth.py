"""Authentication boundary tests for the internal analytics API."""

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from ok_analytics.main import app, require_internal


def test_development_allows_missing_secret(monkeypatch):
    monkeypatch.delenv("ANALYTICS_API_SECRET", raising=False)
    monkeypatch.setenv("APP_ENV", "development")
    require_internal(None)


def test_production_rejects_missing_secret(monkeypatch):
    monkeypatch.delenv("ANALYTICS_API_SECRET", raising=False)
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(HTTPException) as exc:
        require_internal(None)
    assert exc.value.status_code == 503


def test_configured_secret_requires_matching_bearer(monkeypatch):
    monkeypatch.setenv("ANALYTICS_API_SECRET", "test-secret")
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(HTTPException) as exc:
        require_internal("Bearer wrong")
    assert exc.value.status_code == 401
    require_internal("Bearer test-secret")

def test_public_health_is_minimal_and_details_are_protected(monkeypatch):
    monkeypatch.setenv("ANALYTICS_API_SECRET", "test-secret")
    monkeypatch.setenv("APP_ENV", "production")
    client = TestClient(app)

    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/health/details").status_code == 401
    details = client.get("/health/details", headers={"Authorization": "Bearer test-secret"})
    assert details.status_code == 200
    assert "library_versions" in details.json()
