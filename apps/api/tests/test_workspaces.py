"""Workspace discovery tests."""

from __future__ import annotations

import uuid
from typing import Any

from httpx import AsyncClient


async def test_list_workspaces(client: AsyncClient, seeded: dict[str, Any]) -> None:
    response = await client.get("/api/v1/workspaces")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["slug"] == "production"
    assert body[0]["organizationName"] == "Test Cloud"
    assert body[0]["environment"] == "production"


async def test_list_workspaces_empty(client: AsyncClient) -> None:
    """Khaali database pe empty list, 404 nahi.

    Collection endpoint ke liye "kuch nahi mila" ek valid result hai, error
    nahi. Frontend `[]` ko empty state dikha sakta hai; 404 use crash karata.
    """
    response = await client.get("/api/v1/workspaces")

    assert response.status_code == 200
    assert response.json() == []


async def test_get_workspace_detail(client: AsyncClient, seeded: dict[str, Any]) -> None:
    workspace = seeded["workspace"]

    response = await client.get(f"/api/v1/workspaces/{workspace.id}")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(workspace.id)
    assert body["objective"] is not None


async def test_get_unknown_workspace_returns_404(
    client: AsyncClient, unknown_workspace_id: uuid.UUID
) -> None:
    response = await client.get(f"/api/v1/workspaces/{unknown_workspace_id}")

    assert response.status_code == 404
    assert response.json()["code"] == "http_404"


async def test_malformed_uuid_returns_422(client: AsyncClient) -> None:
    """UUID parse fail hone pe 422 — 500 nahi.

    Path parameter validation FastAPI karta hai, isliye galat input database
    tak nahi pahunchta.
    """
    response = await client.get("/api/v1/workspaces/not-a-uuid")

    assert response.status_code == 422


async def test_environment_enum_is_lowercase_value(
    client: AsyncClient, seeded: dict[str, Any]
) -> None:
    """Enum JSON mein `value` ke roop mein aata hai, `name` nahi.

    Yeh regression test hai. SQLAlchemy default se enum ka **name** ("PRODUCTION")
    store karta hai. Humne `values_callable` se ise `value` ("production") par
    force kiya. Agar woh setting hat jaaye, to database aur API disagree karne
    lagenge aur hand-likhi SQL `WHERE environment = 'production'` chup-chaap
    zero rows degi.
    """
    response = await client.get(f"/api/v1/workspaces/{seeded['workspace'].id}")

    assert response.json()["environment"] == "production"
