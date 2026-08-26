"""Health aur root endpoint tests."""

from __future__ import annotations

from httpx import AsyncClient


async def test_health_returns_ok(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"]
    assert body["version"]
    # `databaseConnected` liveness se **alag** field hai. Endpoint database
    # down hone pe bhi 200 deta hai — dekhein health.py ka docstring.
    assert isinstance(body["databaseConnected"], bool)


async def test_health_uses_camel_case_keys(client: AsyncClient) -> None:
    """Contract test: JSON camelCase hai, snake_case nahi.

    Yeh important test hai. Agar koi galti se `APISchema` base class chhod kar
    plain `BaseModel` use karega, to woh endpoint snake_case bhejega aur
    frontend chup-chaap `undefined` padhega — koi error nahi, bas khaali UI.
    """
    response = await client.get("/api/v1/health")

    body = response.json()
    assert "databaseConnected" in body
    assert "database_connected" not in body


async def test_root_lists_entry_points(client: AsyncClient) -> None:
    response = await client.get("/")

    assert response.status_code == 200
    assert response.json()["health"] == "/api/v1/health"


async def test_openapi_schema_is_valid(client: AsyncClient) -> None:
    """OpenAPI generate ho raha hai — SDK generation iske bhroshe pe hai."""
    response = await client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert "/api/v1/workspaces/{workspace_id}/dashboard" in schema["paths"]
    assert "/api/v1/workspaces/{workspace_id}/events" in schema["paths"]
