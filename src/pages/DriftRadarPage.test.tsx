import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

const { appData, getSnapshot } = vi.hoisted(() => ({
  appData: {
    users: [],
    tasks: [],
    boards: [{ id: 'board-1', workspaceId: 'workspace-1', name: 'Test board', description: '', color: 'mint' }],
    loading: false,
    error: null,
    workspace: { id: 'workspace-1', name: 'Workspace', plan: 'FREE', color: '#ffffff' },
  },
  getSnapshot: vi.fn(),
}));

vi.mock('@/hooks/useApp', () => ({ useApp: () => appData }));
vi.mock('@/services', () => ({
  driftService: { snapshot: getSnapshot, evaluate: vi.fn() },
}));

import { DriftRadarPage } from './DriftRadarPage';
import type { DriftSnapshot } from '@/types';

const snapshot: DriftSnapshot = {
  id: 'snapshot-1',
  boardId: 'board-1',
  generatedAt: '2026-11-20T12:00:00Z',
  driftScore: 15,
  health: 'HEALTHY',
  trend: [{ date: '2026-11-20', score: 15 }],
  factors: [],
  workload: [{
    userId: 'user-1',
    userName: 'User One',
    initials: 'UO',
    color: '#B8E4D0',
    openTasks: 2,
    overdueTasks: 0,
    capacity: 4,
  }],
  recoveryActions: [],
  activity: [],
};

afterEach(cleanup);

beforeEach(() => {
  getSnapshot.mockReset().mockResolvedValue(snapshot);
});

describe('DriftRadarPage empty and deterministic recommendations', () => {
  it('explains empty activity and recovery sections while retaining workload', async () => {
    render(createElement(MemoryRouter, null, createElement(DriftRadarPage)));

    expect(await screen.findByText('No drift events have been recorded yet.')).not.toBeNull();
    expect(screen.getByText('No recovery actions are recommended for the current risk signals.')).not.toBeNull();
    expect(screen.getByText('User One')).not.toBeNull();
  });

  it('labels deterministic recovery actions as evidence-based, not AI-assisted', async () => {
    getSnapshot.mockResolvedValueOnce({
      ...snapshot,
      recoveryActions: [{
        id: 'workload-recovery',
        title: 'Review concentrated workload',
        rationale: 'One assignee holds at least 50% of incomplete tasks.',
        effort: 'MEDIUM',
        impact: 'MEDIUM',
        aiGenerated: false,
        relatedTaskIds: [],
      }],
    });
    render(createElement(MemoryRouter, null, createElement(DriftRadarPage)));

    expect(await screen.findByText('Evidence-based')).not.toBeNull();
    expect(screen.getByText('Review concentrated workload')).not.toBeNull();
    expect(screen.queryByText('AI-assisted')).toBeNull();
  });
});
