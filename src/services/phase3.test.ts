import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '@/lib/api';
import { driftService, summaryService, activityService } from './index';

beforeEach(() => vi.clearAllMocks());

describe('Phase 3 analytics services', () => {
  it('maps deterministic drift response without inventing history', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'drift-1',
      board_id: '10000000-0000-0000-0000-000000000001',
      generated_at: '2026-11-18T00:00:00Z',
      drift_score: 45,
      health: 'WATCH',
      trend: [{ date: '2026-11-18', score: 45 }],
      factors: [],
      workload: [],
      recovery_actions: [],
      activity: [
        {
          id: 'event-new',
          workspace_id: 'workspace-1',
          board_id: 'board-1',
          task_id: 'task-1',
          actor_id: 'user-1',
          event_type: 'task_updated',
          detail: 'Task details updated',
          created_at: '2026-11-18T02:00:00Z',
        },
        {
          id: 'event-old',
          workspace_id: 'workspace-1',
          board_id: 'board-1',
          task_id: 'task-1',
          actor_id: 'user-1',
          event_type: 'task_created',
          detail: 'Task created',
          created_at: '2026-11-18T01:00:00Z',
        },
      ],
      historical_trend_available: false,
    }), { status: 200 }));

    const snapshot = await driftService.snapshot('10000000-0000-0000-0000-000000000001');
    expect(snapshot.driftScore).toBe(45);
    expect(snapshot.trend).toHaveLength(1);
    expect(snapshot.activity.map((event) => event.id)).toEqual(['event-old', 'event-new']);
    expect(snapshot.activity[0]).toMatchObject({
      type: 'task_created',
      actorId: 'user-1',
      target: 'Task',
      detail: 'Task created',
    });
    expect(snapshot.activity[1].type).toBe('activity_recorded');
  });

  it('maps real AI summary response', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'summary-1',
      board_id: '10000000-0000-0000-0000-000000000001',
      generated_at: '2026-11-18T00:00:00Z',
      executive_summary: 'One task is overdue.',
      project_overview: 'The board has two tasks.',
      completed_work: ['One task completed'],
      pending_work: ['One task pending'],
      blockers: [],
      priority_recommendations: [],
      confidence: 0.8,
    }), { status: 200 }));

    const summary = await summaryService.generate('10000000-0000-0000-0000-000000000001');
    expect(summary.executiveSummary).toBe('One task is overdue.');
  });

  it('loads the latest persisted AI summary for a board', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'summary-2',
      board_id: '10000000-0000-0000-0000-000000000001',
      generated_at: '2026-11-18T00:00:00Z',
      executive_summary: 'Persisted summary.',
      project_overview: 'Two tasks are tracked.',
      completed_work: ['One complete'],
      pending_work: ['One pending'],
      blockers: [],
      priority_recommendations: [],
      confidence: null,
    }), { status: 200 }));
    const summary = await summaryService.get('10000000-0000-0000-0000-000000000001');
    expect(apiFetch).toHaveBeenCalledWith('/boards/10000000-0000-0000-0000-000000000001/summary');
    expect(summary?.executiveSummary).toBe('Persisted summary.');
    expect(summary?.confidence).toBeNull();
  });

  it('handles empty workspace activity without synthetic events', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    const activity = await activityService.recent();
    expect(activity).toEqual([]);
  });
});
