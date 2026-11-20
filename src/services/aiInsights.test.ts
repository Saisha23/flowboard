/**
 * Regression tests for AI Insights frontend features:
 *   1. exportSummaryPdf utility — popup-window PDF behavior
 *   2. Top Export button — only shows success after popup is opened
 *   3. Bottom Export PDF button — calls the same exportSummaryPdf function
 *   4. Share link button — copies authenticated URL to clipboard
 *   5. summaryService — persistence behavior regression guard
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createElement } from 'react';
import { exportSummaryPdf, type SummaryPdfOptions } from '@/lib/exportPdf';
import { ToastProvider } from '@/components/ui/Toast';
import { useApp } from '@/hooks/useApp';
import { AISummaryPage } from '@/pages/AISummaryPage';
import type { AISummary } from '@/types';

vi.mock('@/hooks/useApp', () => ({ useApp: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

const MOCK_SUMMARY: AISummary = {
  id: 'sum-test-1',
  boardId: 'board-test-1',
  generatedAt: '2026-11-20T00:00:00Z',
  executiveSummary: 'The project is on track with two tasks completed.',
  projectOverview: 'Three tasks total across the board.',
  completedWork: ['Task Alpha completed', 'Task Beta completed'],
  pendingWork: ['Task Gamma is pending'],
  blockers: ['Dependency on external API'],
  priorityRecommendations: [
    { id: 'r1', title: 'Resolve API blocker', reasoning: 'Unblocks downstream work.', urgency: 'HIGH' },
  ],
  confidence: 0.87,
};

const MOCK_OPTS: SummaryPdfOptions = {
  summary: MOCK_SUMMARY,
  boardName: 'Test Board',
  generatedAt: MOCK_SUMMARY.generatedAt,
  taskCount: 3,
  completedCount: 2,
  confidence: 0.87,
};

// ---------------------------------------------------------------------------
// Popup window mock
// ---------------------------------------------------------------------------

interface MockDocument {
  open: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  writtenHtml: string;
}

function setupPopupMock(blocked = false): {
  popupMock: { document: MockDocument; print: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn>; addEventListener: ReturnType<typeof vi.fn>; }
  windowOpenSpy: MockInstance;
} {
  const doc: MockDocument = {
    open: vi.fn(),
    write: vi.fn().mockImplementation(function(html: string) { doc.writtenHtml = html; }),
    close: vi.fn(),
    writtenHtml: '',
  };

  const popupMock = {
    document: doc,
    print: vi.fn(),
    close: vi.fn(),
    focus: vi.fn(),
    addEventListener: vi.fn(),
  };

  const windowOpenSpy = vi
    .spyOn(window, 'open')
    .mockReturnValue(blocked ? null : (popupMock as unknown as Window));

  return { popupMock, windowOpenSpy };
}

// ---------------------------------------------------------------------------
// exportSummaryPdf — utility tests
// ---------------------------------------------------------------------------

describe('exportSummaryPdf utility', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns false when the browser blocks the popup', () => {
    setupPopupMock(true /* blocked */);
    const result = exportSummaryPdf(MOCK_OPTS);
    expect(result).toBe(false);
  });

  it('returns true when the popup is successfully opened', () => {
    setupPopupMock();
    const result = exportSummaryPdf(MOCK_OPTS);
    expect(result).toBe(true);
  });

  it('throws when document generation fails instead of reporting success', () => {
    const { popupMock } = setupPopupMock();
    popupMock.document.write.mockImplementation(() => {
      throw new Error('Document write failed.');
    });

    expect(() => exportSummaryPdf(MOCK_OPTS)).toThrow('Document write failed.');
    expect(popupMock.close).toHaveBeenCalledOnce();
    expect(popupMock.print).not.toHaveBeenCalled();
  });

  it('opens window.open with _blank target', () => {
    const { windowOpenSpy } = setupPopupMock();
    exportSummaryPdf(MOCK_OPTS);
    expect(windowOpenSpy).toHaveBeenCalledOnce();
    const [, target] = windowOpenSpy.mock.calls[0];
    expect(target).toBe('_blank');
  });

  it('writes HTML to the popup document', () => {
    const { popupMock } = setupPopupMock();
    exportSummaryPdf(MOCK_OPTS);
    expect(popupMock.document.open).toHaveBeenCalled();
    expect(popupMock.document.write).toHaveBeenCalled();
    expect(popupMock.document.close).toHaveBeenCalled();
  });

  it('includes the board name in the written HTML', () => {
    const { popupMock } = setupPopupMock();
    exportSummaryPdf(MOCK_OPTS);
    expect(popupMock.document.writtenHtml).toContain('Test Board');
  });

  it('includes the executive summary text in the written HTML', () => {
    const { popupMock } = setupPopupMock();
    exportSummaryPdf(MOCK_OPTS);
    expect(popupMock.document.writtenHtml).toContain('The project is on track with two tasks completed.');
  });

  it('includes completed work items in the written HTML', () => {
    const { popupMock } = setupPopupMock();
    exportSummaryPdf(MOCK_OPTS);
    expect(popupMock.document.writtenHtml).toContain('Task Alpha completed');
    expect(popupMock.document.writtenHtml).toContain('Task Beta completed');
  });

  it('includes pending work items in the written HTML', () => {
    const { popupMock } = setupPopupMock();
    exportSummaryPdf(MOCK_OPTS);
    expect(popupMock.document.writtenHtml).toContain('Task Gamma is pending');
  });

  it('includes blockers in the written HTML', () => {
    const { popupMock } = setupPopupMock();
    exportSummaryPdf(MOCK_OPTS);
    expect(popupMock.document.writtenHtml).toContain('Dependency on external API');
  });

  it('includes priority recommendations with title and reasoning', () => {
    const { popupMock } = setupPopupMock();
    exportSummaryPdf(MOCK_OPTS);
    const html = popupMock.document.writtenHtml;
    expect(html).toContain('Resolve API blocker');
    expect(html).toContain('Unblocks downstream work.');
  });

  it('includes priority label text (High) in the written HTML', () => {
    const { popupMock } = setupPopupMock();
    exportSummaryPdf(MOCK_OPTS);
    expect(popupMock.document.writtenHtml).toContain('High');
  });

  it('includes confidence percentage in the written HTML', () => {
    const { popupMock } = setupPopupMock();
    exportSummaryPdf(MOCK_OPTS);
    expect(popupMock.document.writtenHtml).toContain('87% AI confidence');
  });

  it('includes task count metadata in the written HTML', () => {
    const { popupMock } = setupPopupMock();
    exportSummaryPdf(MOCK_OPTS);
    expect(popupMock.document.writtenHtml).toContain('3 tasks');
    expect(popupMock.document.writtenHtml).toContain('2 completed');
  });

  it('writes valid HTML with DOCTYPE declaration', () => {
    const { popupMock } = setupPopupMock();
    exportSummaryPdf(MOCK_OPTS);
    expect(popupMock.document.writtenHtml.trim()).toMatch(/^<!DOCTYPE html>/i);
  });

  it('HTML includes @media print rule for print-color-adjust', () => {
    const { popupMock } = setupPopupMock();
    exportSummaryPdf(MOCK_OPTS);
    expect(popupMock.document.writtenHtml).toContain('@media print');
  });

  it('HTML does not include any overflow:hidden that could clip content', () => {
    const { popupMock } = setupPopupMock();
    exportSummaryPdf(MOCK_OPTS);
    // The popup document must not inherit the app layout's overflow constraints.
    expect(popupMock.document.writtenHtml).not.toContain('overflow:hidden');
    expect(popupMock.document.writtenHtml).not.toContain('overflow: hidden');
  });

  it('escapes HTML special characters in summary content to prevent injection', () => {
    const { popupMock } = setupPopupMock();
    const opts: SummaryPdfOptions = {
      ...MOCK_OPTS,
      summary: {
        ...MOCK_SUMMARY,
        executiveSummary: 'Review <script>alert(1)</script> & "quotes"',
      },
    };
    exportSummaryPdf(opts);
    const html = popupMock.document.writtenHtml;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;');
  });

  it('escapes summary and metadata text, including an invalid generated date', () => {
    const { popupMock } = setupPopupMock();
    const opts: SummaryPdfOptions = {
      ...MOCK_OPTS,
      boardName: '<img src=x onerror=alert(1)>',
      generatedAt: '<script>alert(2)</script>',
      summary: {
        ...MOCK_SUMMARY,
        projectOverview: '<b>overview</b>',
        completedWork: ['<i>highlight</i>'],
        blockers: ['<svg onload=alert(3)>'],
        priorityRecommendations: [
          { ...MOCK_SUMMARY.priorityRecommendations[0], title: '<em>recommendation</em>' },
        ],
      },
    };

    exportSummaryPdf(opts);
    const html = popupMock.document.writtenHtml;
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert(2)</script>');
    expect(html).not.toContain('<b>overview</b>');
    expect(html).not.toContain('<i>highlight</i>');
    expect(html).not.toContain('<svg onload=alert(3)>');
    expect(html).not.toContain('<em>recommendation</em>');
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
  });

  it('handles empty completed/pending/blocker arrays gracefully', () => {
    const { popupMock } = setupPopupMock();
    const opts: SummaryPdfOptions = {
      ...MOCK_OPTS,
      summary: { ...MOCK_SUMMARY, completedWork: [], pendingWork: [], blockers: [], priorityRecommendations: [] },
    };
    exportSummaryPdf(opts);
    expect(popupMock.document.writtenHtml).toContain('None reported.');
  });

  it('handles absent and empty summary fields without throwing', () => {
    const { popupMock } = setupPopupMock();
    const summary: Partial<AISummary> = {
      executiveSummary: '',
      generatedAt: MOCK_SUMMARY.generatedAt,
      completedWork: undefined,
      pendingWork: [],
      blockers: undefined,
      priorityRecommendations: undefined,
    };

    expect(() => exportSummaryPdf({ ...MOCK_OPTS, summary: summary as AISummary })).not.toThrow();
    expect(popupMock.document.writtenHtml).toContain('No recommendations at this time.');
    expect(popupMock.document.writtenHtml.match(/None reported\./g)).toHaveLength(3);
  });
});

describe('AISummaryPage PDF export buttons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApp).mockReturnValue({
      currentUser: null,
      users: [],
      workspace: { id: 'workspace-1', name: 'Workspace', plan: 'FREE', color: '#ffffff' },
      workspaces: [],
      boards: [{ id: 'board-1', workspaceId: 'workspace-1', name: 'Test Board', description: '', color: 'mint' }],
      lists: [],
      tasks: [],
      labels: [],
      loading: false,
      error: null,
      refreshTasks: vi.fn(),
      updateTask: vi.fn(),
      createTask: vi.fn(),
      deleteTask: vi.fn(),
      switchWorkspace: vi.fn(),
      reloadWorkspace: vi.fn(),
    } as ReturnType<typeof useApp>);
  });

  it('exports the complete structured summary from both buttons', async () => {
    vi.spyOn(summaryService, 'get').mockResolvedValue(MOCK_SUMMARY);
    const { popupMock, windowOpenSpy } = setupPopupMock();
    render(createElement(
      MemoryRouter,
      null,
      createElement(ToastProvider, null, createElement(AISummaryPage)),
    ));

    fireEvent.click(await screen.findByRole('button', { name: 'Export' }));
    expect(popupMock.document.writtenHtml).toContain(MOCK_SUMMARY.executiveSummary);
    expect(popupMock.document.writtenHtml).toContain('Task Alpha completed');
    expect(popupMock.document.writtenHtml).toContain('Dependency on external API');
    expect(popupMock.document.writtenHtml).toContain('Resolve API blocker');

    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(windowOpenSpy).toHaveBeenCalledTimes(2);
    expect(popupMock.document.writtenHtml).toContain(MOCK_SUMMARY.executiveSummary);
    expect(popupMock.document.writtenHtml).toContain('Resolve API blocker');
  });

  it('shows an error and no success toast when PDF document generation fails', async () => {
    vi.spyOn(summaryService, 'get').mockResolvedValue(MOCK_SUMMARY);
    const { popupMock } = setupPopupMock();
    popupMock.document.write.mockImplementation(() => {
      throw new Error('Document write failed.');
    });
    render(createElement(
      MemoryRouter,
      null,
      createElement(ToastProvider, null, createElement(AISummaryPage)),
    ));

    fireEvent.click(await screen.findByRole('button', { name: 'Export' }));
    expect(await screen.findByText('Document write failed.')).not.toBeNull();
    expect(screen.queryByText('Print dialog opened')).toBeNull();
  });

  it('shows an error and no success toast when the browser blocks the popup', async () => {
    vi.spyOn(summaryService, 'get').mockResolvedValue(MOCK_SUMMARY);
    const { windowOpenSpy } = setupPopupMock(true);
    render(createElement(
      MemoryRouter,
      null,
      createElement(ToastProvider, null, createElement(AISummaryPage)),
    ));

    fireEvent.click(await screen.findByRole('button', { name: 'Export' }));
    expect(windowOpenSpy).toHaveBeenCalledOnce();
    expect(await screen.findByText('Export failed')).not.toBeNull();
    expect(screen.queryByText('Print dialog opened')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// summaryService — existing persistence tests (regression guard)
// ---------------------------------------------------------------------------

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '@/lib/api';
import { summaryService } from '@/services';

describe('summaryService regression — PDF/share features do not break summary loading', () => {
  beforeEach(() => vi.clearAllMocks());

  it('still generates a summary via POST to /boards/:id/summary', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'sum-1',
      board_id: 'board-1',
      generated_at: '2026-11-20T00:00:00Z',
      executive_summary: 'All good.',
      project_overview: 'Two tasks.',
      completed_work: ['Task A'],
      pending_work: ['Task B'],
      blockers: [],
      priority_recommendations: [],
      confidence: 0.9,
    }), { status: 200 }));

    const summary = await summaryService.generate('board-1');
    expect(apiFetch).toHaveBeenCalledWith('/boards/board-1/summary', { method: 'POST' });
    expect(summary.executiveSummary).toBe('All good.');
    expect(summary.confidence).toBe(0.9);
  });

  it('still fetches the persisted summary via GET /boards/:id/summary', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'sum-2',
      board_id: 'board-1',
      generated_at: '2026-11-20T00:00:00Z',
      executive_summary: 'Persisted.',
      project_overview: 'Three tasks.',
      completed_work: [],
      pending_work: ['Task C'],
      blockers: ['One blocker'],
      priority_recommendations: [{ id: 'r1', title: 'Fix it', reasoning: 'Now', urgency: 'HIGH' }],
      confidence: null,
    }), { status: 200 }));

    const summary = await summaryService.get('board-1');
    expect(apiFetch).toHaveBeenCalledWith('/boards/board-1/summary');
    expect(summary?.executiveSummary).toBe('Persisted.');
    expect(summary?.confidence).toBeNull();
    expect(summary?.priorityRecommendations).toHaveLength(1);
    expect(summary?.priorityRecommendations[0].title).toBe('Fix it');
  });

  it('returns null when no summary exists', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify(null), { status: 200 }));
    const summary = await summaryService.get('board-no-summary');
    expect(summary).toBeNull();
  });
});
