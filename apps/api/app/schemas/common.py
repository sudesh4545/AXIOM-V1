"""Shared Pydantic base for saare API schemas.

**camelCase JSON, snake_case Python.** Python code PEP 8 follow karta hai
(`predicted_uplift_pct`), par JSON TypeScript convention follow karta hai
(`predictedUpliftPct`). Pydantic ka `alias_generator` yeh translation
automatically karta hai, isliye kisi bhi side pe manual mapping nahi likhni
padti.

`populate_by_name=True` matlab request bodies dono form accept karti hain —
SDK integrators ke liye forgiving.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


def _ensure_utc(value: datetime) -> datetime:
    """Naive datetime ko UTC maano, aware ko UTC mein convert karo.

    **Yeh ek asli bug ka fix hai, cosmetic cleanup nahi.**

    Columns `DateTime(timezone=True)` hain, par SQLite mein timezone type hi
    nahi hota — woh datetime ko naive karke wapas deta hai. Aise naive value
    ka JSON `"2026-07-27T10:25:06.544652"` banta hai, **bina `Z` ke**. Aur
    JavaScript ka `new Date("2026-07-27T10:25:06.544652")` us string ko
    **local time** maanta hai. Matlab IST browser mein har chart point 5.5
    ghante shift ho jaata — koi error nahi, bas chupke se galat graph.

    Isliye conversion serialisation boundary pe kar rahe hain: database dialect
    kuch bhi ho, API se hamesha explicit UTC (`...Z`) jaata hai.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


#: Har API datetime field ke liye use karein — plain `datetime` ke bajaye.
UTCDateTime = Annotated[datetime, AfterValidator(_ensure_utc)]


class APISchema(BaseModel):
    """Base for request aur response models."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,  # ORM objects se direct build kar sakein
        str_strip_whitespace=True,
    )


class HealthResponse(APISchema):
    """Liveness + readiness probe.

    Do alag cheezein batata hai:
      - `status`: process zinda hai (liveness)
      - `database_connected`: dependencies reachable hain (readiness)

    Inko mila dena ek classic ops galti hai — database down hone pe container
    restart hota rehta hai jabki asli problem kahin aur hai.
    """

    status: str
    service: str
    version: str
    environment: str
    database_connected: bool
    database_dialect: str
    timestamp: UTCDateTime


class ErrorDetail(APISchema):
    """Consistent error envelope.

    Har error same shape mein aata hai taaki frontend ek hi error handler
    likhe, HTTP status ke hisaab se alag-alag parsing na kare.
    """

    code: str
    message: str
    details: dict[str, object] | None = None
