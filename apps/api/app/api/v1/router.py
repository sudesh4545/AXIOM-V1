"""API v1 router aggregation.

Versioned prefix (`/api/v1`) day one se hai. Baad mein version add karna
painful hota hai kyunki tab tak clients unversioned paths pe depend kar chuke
hote hain aur unhe todna padta hai.
"""

from fastapi import APIRouter

from app.api.v1.routes import dashboard, events, health, workspaces

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(workspaces.router)
api_router.include_router(dashboard.router)
api_router.include_router(events.router)

__all__ = ["api_router"]
