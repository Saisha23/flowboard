import json

import pytest

from app.core.config import Settings
from app.services.ai import (
    OpenAICompatibleProvider,
    SummaryRecommendation,
    SummaryResult,
    get_ai_provider,
)


def _settings(**overrides: object) -> Settings:
    aliases = {
        "ai_api_key": "AI_API_KEY",
        "ai_provider": "AI_PROVIDER",
        "ai_model": "AI_MODEL",
        "ai_base_url": "AI_BASE_URL",
        "ai_timeout_seconds": "AI_TIMEOUT_SECONDS",
    }
    values: dict[str, object] = {
        "SUPABASE_URL": "https://project.example",
        "SUPABASE_ANON_KEY": "test-anon-key",
    }
    values.update({aliases.get(key, key): value for key, value in overrides.items()})
    return Settings(**values)


@pytest.mark.asyncio
async def test_missing_ai_provider_returns_explicit_error() -> None:
    provider = get_ai_provider(_settings(ai_api_key=""))
    with pytest.raises(RuntimeError, match="AI credentials"):
        await provider.summarize({"task_totals": {"total": 0}})


@pytest.mark.asyncio
async def test_unsupported_configured_ai_provider_returns_explicit_error() -> None:
    provider = get_ai_provider(_settings(ai_api_key="test-key", ai_provider="unknown"))
    with pytest.raises(RuntimeError, match="provider is not supported"):
        await provider.summarize({})


@pytest.mark.asyncio
async def test_openai_compatible_provider_sends_configured_request_and_validates_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    expected = {
        "executive_summary": "One task is overdue.",
        "project_overview": "One active task.",
        "completed_work": [],
        "pending_work": ["Review release"],
        "blockers": [],
        "priority_recommendations": [],
        "confidence": 0.8,
    }
    request: dict[str, object] = {}

    class FakeResponse:
        status_code = 200

        def json(self) -> dict[str, object]:
            return {"choices": [{"message": {"content": json.dumps(expected)}}]}

    class FakeAsyncClient:
        def __init__(self, *, timeout: float) -> None:
            request["timeout"] = timeout

        async def __aenter__(self) -> "FakeAsyncClient":
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def post(
            self,
            url: str,
            *,
            headers: dict[str, str],
            json: dict[str, object],
        ) -> FakeResponse:
            request.update({"url": url, "headers": headers, "body": json})
            return FakeResponse()

    monkeypatch.setattr("app.services.ai.httpx.AsyncClient", FakeAsyncClient)
    provider = get_ai_provider(_settings(
        ai_api_key=" test-key ",
        ai_provider=" openai ",
        ai_model="test-model",
        ai_base_url="https://ai.example/v1/",
        ai_timeout_seconds=7,
    ))

    result = await provider.summarize({"task_totals": {"total": 1}})

    assert isinstance(provider, OpenAICompatibleProvider)
    assert result.executive_summary == "One task is overdue."
    assert request["timeout"] == 7
    assert request["url"] == "https://ai.example/v1/chat/completions"
    assert request["headers"] == {"Authorization": "Bearer test-key"}
    request_body = request["body"]
    assert request_body["model"] == "test-model"
    assert request_body["temperature"] == 0
    assert request_body["response_format"] == {"type": "json_object"}
    assert request_body["messages"][0]["role"] == "system"
    assert "untrusted data" in request_body["messages"][0]["content"]
    assert "Never include UUIDs" in request_body["messages"][0]["content"]
    assert "board name" in request_body["messages"][0]["content"]
    assert request_body["messages"][1] == {
        "role": "user",
        "content": '{"task_totals": {"total": 1}}',
    }


@pytest.mark.asyncio
async def test_openai_compatible_provider_rejects_invalid_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeResponse:
        status_code = 200

        def json(self) -> dict[str, object]:
            return {"choices": [{"message": {"content": '{"executive_summary": ""}'}}]}

    class FakeAsyncClient:
        def __init__(self, *, timeout: float) -> None:
            pass

        async def __aenter__(self) -> "FakeAsyncClient":
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def post(self, *_: object, **__: object) -> FakeResponse:
            return FakeResponse()

    monkeypatch.setattr("app.services.ai.httpx.AsyncClient", FakeAsyncClient)
    provider = OpenAICompatibleProvider(_settings(ai_api_key="test-key"))

    with pytest.raises(RuntimeError, match="invalid structured response"):
        await provider.summarize({})


def test_structured_ai_schema_rejects_invalid_confidence() -> None:
    with pytest.raises(ValueError):
        SummaryResult(
            executive_summary="Summary",
            project_overview="Overview",
            completed_work=[],
            pending_work=[],
            blockers=[],
            priority_recommendations=[],
            confidence=2,
        )


def test_structured_ai_schema_rejects_invalid_urgency() -> None:
    with pytest.raises(ValueError):
        SummaryRecommendation(
            title="Review",
            reasoning="One overdue task",
            urgency="SEVERE",
        )
