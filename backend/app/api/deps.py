"""FastAPI dependencies: verified Auth JWT + request-scoped Supabase client."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from jwt.exceptions import (
    ExpiredSignatureError,
    InvalidAlgorithmError,
    InvalidAudienceError,
    InvalidIssuerError,
    InvalidSignatureError,
    InvalidTokenError,
    PyJWKClientError,
)

from app.core.config import Settings, get_settings_optional
from app.services.supabase import SupabaseUserClient

_bearer = HTTPBearer(auto_error=False)

# Process-wide JWKS cache (public verification keys only — not user credentials).
_jwks_client: PyJWKClient | None = None


def init_jwks_client(settings: Settings) -> PyJWKClient:
    """Create the JWKS client used for ES256/RS256 Auth tokens."""
    global _jwks_client
    _jwks_client = PyJWKClient(settings.jwks_url, cache_jwk_set=True, lifespan=3600)
    return _jwks_client


def _get_jwks_client(settings: Settings) -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        return init_jwks_client(settings)
    return _jwks_client


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    """Verified Supabase Auth identity (JWT claims)."""

    id: str
    access_token: str
    claims: dict[str, Any]

    @property
    def email(self) -> str | None:
        email = self.claims.get("email")
        return email if isinstance(email, str) else None

    @property
    def phone(self) -> str | None:
        phone = self.claims.get("phone")
        return phone if isinstance(phone, str) else None

    @property
    def role(self) -> str | None:
        role = self.claims.get("role")
        return role if isinstance(role, str) else None


def verify_supabase_jwt(token: str, settings: Settings) -> dict[str, Any]:
    """Cryptographically verify a Supabase Auth access token.

    Algorithm is taken from the token header, then checked against the allow-list
    and verified with either JWKS (ES256/RS256) or SUPABASE_JWT_SECRET (HS256).
    The payload is not trusted until signature, expiry, audience, and issuer pass.
    """
    try:
        header = jwt.get_unverified_header(token)
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed access token.",
        ) from exc

    alg = str(header.get("alg") or "")
    allowed = settings.allowed_jwt_algorithms
    if alg not in allowed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token algorithm {alg or 'unknown'} is not allowed.",
        )

    key: Any
    if alg in {"ES256", "RS256"}:
        try:
            signing_key = _get_jwks_client(settings).get_signing_key_from_jwt(token)
            key = signing_key.key
        except PyJWKClientError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not resolve a signing key for this token.",
            ) from exc
    elif alg == "HS256":
        if not settings.supabase_jwt_secret:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="HS256 tokens require SUPABASE_JWT_SECRET on the server.",
            )
        key = settings.supabase_jwt_secret
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Unsupported signing algorithm: {alg}.",
        )

    decode_kwargs: dict[str, Any] = {
        "algorithms": [alg],
        "audience": settings.jwt_audience,
        "issuer": settings.auth_issuer,
        "options": {
            "require": ["exp", "sub", "iat"],
            "verify_signature": True,
            "verify_exp": True,
            "verify_aud": True,
            "verify_iss": True,
        },
    }

    try:
        payload = jwt.decode(token, key, **decode_kwargs)
    except ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token has expired.",
        ) from exc
    except InvalidSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token signature.",
        ) from exc
    except (InvalidAudienceError, InvalidIssuerError, InvalidAlgorithmError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token audience, issuer, or algorithm is invalid.",
        ) from exc
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token.",
        ) from exc

    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token is missing a subject.",
        )
    return payload


def require_settings() -> Settings:
    settings = get_settings_optional()
    if settings is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Server is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY "
                "in backend/.env (see .env.example)."
            ),
        )
    return settings


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    settings: Settings = Depends(require_settings),
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    claims = verify_supabase_jwt(credentials.credentials, settings)
    return AuthenticatedUser(
        id=str(claims["sub"]),
        access_token=credentials.credentials,
        claims=claims,
    )


async def get_supabase_for_user(
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(require_settings),
) -> AsyncIterator[SupabaseUserClient]:
    """New Data API client per request, authorized as `user` only."""
    client = SupabaseUserClient(settings=settings, access_token=user.access_token)
    try:
        yield client
    finally:
        await client.aclose()
