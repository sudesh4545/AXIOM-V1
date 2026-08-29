"""AXIOM API configuration.

Sab configuration environment variables se aati hai. Code mein koi secret
hardcode nahi hai — `.env` file gitignored hai aur `.env.example` sirf
placeholder rakhti hai.

Interview note: `AXIOM_` prefix isliye lagaya hai ki jab yeh service kisi
shared host ya container mein chale, to hamare variables kisi doosre process
ke variables se collide na karein.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["local", "staging", "production"]


class Settings(BaseSettings):
    """Runtime settings, environment se load hoti hain."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="AXIOM_",
        extra="ignore",
    )

    # --- Application ---
    app_name: str = "AXIOM API"
    app_version: str = "0.2.0"
    environment: Environment = "local"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"

    # --- Database ---
    # Local default SQLite hai taaki `git clone` ke baad service bina kisi
    # install ke chal jaaye. Production mein sirf yeh ek variable badalna hai:
    #   AXIOM_DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/axiom
    database_url: str = "sqlite+aiosqlite:///./axiom_local.db"
    database_echo: bool = False

    # --- CORS ---
    # Comma-separated list rakhi hai kyunki env vars strings hote hain; JSON
    # likhwane se deployment mein galti hone ke chances zyada hain.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173"

    # --- Ingestion limits ---
    # Compatibility-service batch cap. The working same-origin API also has
    # durable request throttling and stricter per-event limits.
    max_events_per_request: int = 500

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")


@lru_cache
def get_settings() -> Settings:
    """Settings ka single cached instance.

    `lru_cache` isliye ki `.env` file har request pe dobara na padhi jaaye.
    """
    return Settings()
