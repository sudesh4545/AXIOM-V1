"""AXIOM API application entry point.

Run karne ke liye:
    uvicorn app.main:app --reload --port 8000

Interactive API docs: http://localhost:8000/docs
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.db.session import check_database_connection, engine
from app.schemas.common import ErrorDetail

settings = get_settings()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("axiom.api")

# Debug mode sirf **hamare** logger ko verbose karta hai, root logger ko nahi.
# Root ko DEBUG karne se aiosqlite har single statement log karta hai aur asli
# application messages us shor mein gum ho jaate hain. SQL dekhna ho to uske
# liye alag switch hai: `AXIOM_DATABASE_ECHO=true`.
if settings.debug:
    logging.getLogger("axiom").setLevel(logging.DEBUG)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Startup / shutdown.

    Startup pe database connectivity check karte hain par **fail nahi karte**.
    Kyun? Kyunki API ka `/health` endpoint tabhi kaam ka hai jab woh reachable
    ho aur bataye ki database down hai. Startup pe crash hone se sirf restart
    loop banta hai aur koi diagnostic nahi milta.

    Yahan tables **create nahi** karte. Schema changes Alembic migrations se
    hote hain (`alembic upgrade head`). `create_all()` production mein use
    karna migrations ko bekaar kar deta hai — do jagah se schema badalne lagta
    hai aur dono kabhi match nahi karte.
    """
    logger.info("Starting %s v%s (%s)", settings.app_name, settings.app_version, settings.environment)
    logger.info("Database dialect: %s", engine.dialect.name)

    if await check_database_connection():
        logger.info("Database connection OK")
    else:
        logger.warning(
            "Database NOT reachable. API chalegi par data endpoints fail karenge. "
            "AXIOM_DATABASE_URL check karein aur `alembic upgrade head` chalayein."
        )

    yield

    await engine.dispose()
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "AXIOM — verified autonomous experimentation OS for B2B SaaS startups.\n\n"
        "**Note:** Dashboard values currently come from demo seed data. Every "
        "dashboard response carries a `dataSource` field and a "
        "`dataSourceNote` explaining exactly what the numbers represent."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# CORS: sirf configured origins allow karte hain, `*` nahi. `*` ke saath
# credentials bhejna browsers block karte hain, aur woh production mein
# genuine security hole bhi hai.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)


# ---------------------------------------------------------------------------
# Error handling
#
# Har error ek hi shape mein aata hai (`ErrorDetail`). Isse frontend ek error
# handler likhta hai, HTTP status ke hisaab se alag-alag parsing nahi.
# ---------------------------------------------------------------------------


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorDetail(
            code=f"http_{exc.status_code}",
            message=str(exc.detail),
        ).model_dump(by_alias=True),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    """422 validation errors.

    Field-level errors pass-through karte hain taaki SDK integrator ko exactly
    pata chale ki kaunsa event kis field pe reject hua — "invalid request"
    jaisa useless message nahi.
    """
    return JSONResponse(
        status_code=422,
        content=ErrorDetail(
            code="validation_error",
            message="Request payload validation failed",
            details={"errors": _public_validation_errors(exc)},
        ).model_dump(by_alias=True),
    )


def _public_validation_errors(exc: RequestValidationError) -> list[dict[str, str]]:
    """Pydantic errors ko safe, JSON-serialisable shape mein badlo.

    Do asli reasons, dono bugs se seekhe hue:

    1. **`exc.errors()` seedha JSON mein nahi jaa sakta.** Jab hamara koi
       custom validator `ValueError` raise karta hai, Pydantic us exception
       **object** ko error dict ke `ctx` field mein daal deta hai. `json.dumps`
       us par `TypeError` phenkta hai, jo bare-Exception handler pakadta hai —
       aur client ko 422 ki jagah **500** milta hai. Matlab hamari saari
       hand-likhi validation (snake_case name, revenue consistency, clock skew)
       galat status code deti thi. Yeh bug tests ne pakda.

    2. **`input` field jaan-boojh kar drop kiya hai.** Pydantic error mein user
       ka raw input echo hota hai. Event payload mein customer ka data hota
       hai, aur error responses proxy/monitoring logs mein chale jaate hain —
       to woh data un jagah pahunch jaata jahan uska hona zaroori nahi. Field
       ka naam aur reason debugging ke liye kaafi hai.
    """
    errors: list[dict[str, str]] = []
    for error in exc.errors():
        location = error.get("loc", ())
        errors.append(
            {
                # "body.events.0.name" — SDK integrator ko exactly batata hai ki
                # batch ka kaunsa event aur kaunsi field problem hai.
                "field": ".".join(str(part) for part in location) or "body",
                "message": str(error.get("msg", "Invalid value")),
                "type": str(error.get("type", "value_error")),
            }
        )
    return errors


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Last-resort handler.

    Server pe poora traceback log karte hain, par client ko generic message
    dete hain. Stack traces client ko bhejne se internal paths, library
    versions aur kabhi-kabhi credentials leak hote hain.
    """
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content=ErrorDetail(
            code="internal_error",
            message="An unexpected error occurred. The incident has been logged.",
        ).model_dump(by_alias=True),
    )


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "health": f"{settings.api_v1_prefix}/health",
    }
