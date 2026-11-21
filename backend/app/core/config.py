"""Application settings loaded from environment variables / `.env`."""

from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import AliasChoices, Field, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/.env regardless of the process working directory
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_ENV_FILE = _BACKEND_DIR / ".env"


class Settings(BaseSettings):
    """Runtime configuration. Secrets stay on the server; they are never returned by the API."""

    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    supabase_url: str = Field(
        ...,
        validation_alias=AliasChoices("SUPABASE_URL"),
        description="Supabase project URL (https://<ref>.supabase.co)",
    )
    # Publishable or legacy anon key — used only as the Data API `apikey` header.
    supabase_anon_key: str = Field(
        ...,
        validation_alias=AliasChoices("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"),
        description="Supabase anon / publishable key",
    )
    # Optional: required only for legacy HS256 Auth JWTs.
    supabase_jwt_secret: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SUPABASE_JWT_SECRET"),
    )
    cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        validation_alias=AliasChoices("CORS_ORIGINS"),
    )
    jwt_audience: str = Field(
        default="authenticated",
        validation_alias=AliasChoices("JWT_AUDIENCE"),
    )
    jwt_issuer: str | None = Field(
        default=None,
        validation_alias=AliasChoices("JWT_ISSUER"),
    )
    jwt_algorithms: str = Field(
        default="ES256,RS256,HS256",
        validation_alias=AliasChoices("JWT_ALGORITHMS"),
    )
    ai_provider: str = Field(
        default="openai",
        validation_alias=AliasChoices("AI_PROVIDER"),
    )
    ai_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("AI_API_KEY"),
    )
    ai_model: str = Field(
        default="gpt-4o-mini",
        validation_alias=AliasChoices("AI_MODEL"),
    )
    ai_base_url: str = Field(
        default="https://api.openai.com/v1",
        validation_alias=AliasChoices("AI_BASE_URL"),
    )
    ai_timeout_seconds: float = Field(
        default=20,
        ge=1,
        le=120,
        validation_alias=AliasChoices("AI_TIMEOUT_SECONDS"),
    )

    @field_validator("supabase_url")
    @classmethod
    def strip_trailing_slash(cls, value: str) -> str:
        url = value.strip().rstrip("/")
        if not url.startswith("https://") and not url.startswith("http://"):
            raise ValueError("SUPABASE_URL must start with http:// or https://")
        return url

    @field_validator("cors_origins")
    @classmethod
    def validate_cors_origins(cls, value: str) -> str:
        origins = [origin.strip() for origin in value.split(",") if origin.strip()]
        for origin in origins:
            try:
                parsed = urlsplit(origin)
                parsed.port
            except ValueError as exc:
                raise ValueError("CORS_ORIGINS must contain valid exact origins.") from exc

            if (
                "*" in origin
                or any(character.isspace() for character in origin)
                or parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or parsed.username is not None
                or parsed.password is not None
                or parsed.path
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError(
                    "CORS_ORIGINS must contain exact http:// or https:// origins "
                    "without paths, credentials, query strings, or wildcards."
                )
        return ",".join(origins)

    @field_validator("supabase_jwt_secret", mode="before")
    @classmethod
    def empty_secret_to_none(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allowed_jwt_algorithms(self) -> list[str]:
        return [alg.strip().upper() for alg in self.jwt_algorithms.split(",") if alg.strip()]

    @property
    def auth_issuer(self) -> str:
        """Expected `iss` claim. Override with JWT_ISSUER when self-hosting Auth."""
        if self.jwt_issuer:
            return self.jwt_issuer.rstrip("/")
        return f"{self.supabase_url}/auth/v1"

    @property
    def jwks_url(self) -> str:
        """Supabase Auth JWKS (asymmetric signing keys: ES256 / RS256)."""
        return f"{self.supabase_url}/auth/v1/.well-known/jwks.json"

    @property
    def rest_url(self) -> str:
        return f"{self.supabase_url}/rest/v1"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings. Missing required env vars raise pydantic ValidationError."""
    return Settings()  # type: ignore[call-arg]


def get_settings_optional() -> Settings | None:
    """Return settings or None when SUPABASE_URL / SUPABASE_ANON_KEY are unset."""
    try:
        return get_settings()
    except ValidationError:
        return None
