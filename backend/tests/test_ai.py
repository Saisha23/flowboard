import pytest

from app.services.ai import MissingAIProvider, SummaryRecommendation, SummaryResult


@pytest.mark.asyncio
async def test_missing_ai_provider_returns_explicit_error() -> None:
    provider = MissingAIProvider()
    with pytest.raises(RuntimeError, match="AI credentials"):
        await provider.summarize({"task_totals": {"total": 0}})


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
