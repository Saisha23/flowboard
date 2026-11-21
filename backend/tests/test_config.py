import pytest
from pydantic import ValidationError

from app.core.config import Settings


def _settings(cors_origins: str) -> Settings:
    return Settings(
        SUPABASE_URL="https://project.example",
        SUPABASE_ANON_KEY="test-anon-key",
        CORS_ORIGINS=cors_origins,
    )


def test_cors_origins_accept_exact_production_origins() -> None:
    settings = _settings(" https://flowboard.example.test , https://preview.example.test ")

    assert settings.cors_origin_list == [
        "https://flowboard.example.test",
        "https://preview.example.test",
    ]


@pytest.mark.parametrize(
    "cors_origins",
    [
        "*",
        "https://*.vercel.app",
        "https://flow board.example.test",
        "https://flowboard.example.test/app",
        "https://user:password@flowboard.example.test",
        "https://flowboard.example.test?next=/app",
    ],
)
def test_cors_origins_reject_wildcards_and_non_origins(cors_origins: str) -> None:
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        _settings(cors_origins)
