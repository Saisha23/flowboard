/**
 * exportSummaryPdf — generates a PDF from AI summary data.
 *
 * WHY A NEW WINDOW INSTEAD OF WINDOW.PRINT ON THE CURRENT PAGE:
 * The AppLayout wraps all pages in `overflow:hidden` / `overflow-y:auto`
 * containers. When @media-print CSS hides the sidebar and reveals only the
 * target element, the browser's print renderer still sees the element clipped
 * by its ancestor overflow boxes, producing a blank page. No amount of CSS
 * overrides can fix clipping that originates from layout ancestors in the
 * same stacking context.
 *
 * The reliable fix is to build a self-contained HTML document from the
 * structured data (which we already hold in memory as an AISummary object)
 * and render it in a fresh window that has no overflow constraints at all.
 *
 * The popup is sized to A4 portrait (794 × 1123 px at 96 dpi) so the
 * browser's print dialog defaults to the right paper size, then closed after
 * the user dismisses the dialog.
 *
 * @returns true  if the popup was opened and window.print() was called.
 * @returns false if the browser blocked the popup.
 */

import type { AISummary } from '@/types';

export interface SummaryPdfOptions {
  summary: AISummary;
  boardName: string;
  generatedAt: string;
  taskCount?: number;
  completedCount?: number;
  confidence?: number | null;
}

export function exportSummaryPdf(opts: SummaryPdfOptions): boolean {
  const { summary, boardName, generatedAt, taskCount, completedCount, confidence } = opts;

  const html = buildHtml(summary, boardName, generatedAt, taskCount, completedCount, confidence);

  // Open a popup sized to A4 portrait (px at 96 dpi: 794×1123).
  const popup = window.open(
    '',
    '_blank',
    'width=820,height=1060,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes',
  );
  if (!popup) return false;

  try {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.addEventListener('afterprint', () => popup.close(), { once: true });
    popup.print();
  } catch (cause) {
    popup.close();
    throw cause;
  }

  return true;
}

// ---------------------------------------------------------------------------
// HTML builder — produces a fully-styled, self-contained document.
// All CSS is inlined so it works without any network requests.
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringItems(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const urgencyLabel: Record<string, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

const urgencyColor: Record<string, string> = {
  URGENT: '#c0392b',
  HIGH: '#e67e22',
  MEDIUM: '#7f8c9e',
  LOW: '#27ae60',
};

function listItems(items: string[], bullet = '•'): string {
  if (!items.length) return '<p style="color:#7f8c9e;font-size:13px;">None reported.</p>';
  return `<ul style="margin:0;padding-left:1.25em;list-style:none;">${
    items.map((item) => `<li style="margin-bottom:6px;font-size:13px;line-height:1.6;position:relative;">
      <span style="position:absolute;left:-1.1em;">${bullet}</span>${esc(item)}</li>`).join('')
  }</ul>`;
}

function section(title: string, accentColor: string, body: string): string {
  return `
    <div style="break-inside:avoid;margin-bottom:20px;border:1px solid #e8ecf0;border-radius:8px;">
      <div style="background:${accentColor}18;border-bottom:1px solid ${accentColor}30;padding:10px 16px;">
        <h2 style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${accentColor};">${esc(title)}</h2>
      </div>
      <div style="padding:14px 16px;">${body}</div>
    </div>`;
}

function buildHtml(
  summary: AISummary,
  boardName: string,
  generatedAt: string,
  taskCount?: number,
  completedCount?: number,
  confidence?: number | null,
): string {
  const safeBoardName = text(boardName) || 'Flowboard';
  const safeGeneratedAt = text(generatedAt);
  const executiveSummary = text(summary?.executiveSummary);
  const projectOverview = text(summary?.projectOverview);
  const completedWork = stringItems(summary?.completedWork);
  const pendingWork = stringItems(summary?.pendingWork);
  const blockers = stringItems(summary?.blockers);
  const priorityRecommendations = Array.isArray(summary?.priorityRecommendations)
    ? summary.priorityRecommendations.flatMap((recommendation) => {
      if (!recommendation || typeof recommendation !== 'object') return [];
      return [{
        title: text(recommendation.title),
        reasoning: text(recommendation.reasoning),
        urgency: text(recommendation.urgency),
      }];
    })
    : [];

  const confidenceStr = confidence != null ? `${Math.round(confidence * 100)}% AI confidence` : '';
  const taskMeta = taskCount != null
    ? `${taskCount} task${taskCount === 1 ? '' : 's'} · ${completedCount ?? 0} completed`
    : '';

  const recommendations = priorityRecommendations.map((r) => {
    const knownUrgency = Object.prototype.hasOwnProperty.call(urgencyColor, r.urgency);
    const color = knownUrgency ? urgencyColor[r.urgency] : '#7f8c9e';
    const label = knownUrgency ? urgencyLabel[r.urgency] : r.urgency;
    return `
      <div style="break-inside:avoid;border:1px solid #e8ecf0;border-radius:6px;padding:12px 14px;margin-bottom:10px;display:flex;gap:12px;align-items:flex-start;">
        <span style="flex-shrink:0;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;
                     background:${color}18;color:${color};border-radius:999px;padding:3px 8px;margin-top:2px;">${esc(label)}</span>
        <div>
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#1a2232;">${esc(r.title)}</p>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#5a6a7e;">${esc(r.reasoning)}</p>
        </div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Board Summary — ${esc(safeBoardName)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { margin: 18mm 16mm; size: A4 portrait; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 13px;
      color: #1a2232;
      background: #fff;
      margin: 0;
      padding: 24px 28px;
      line-height: 1.6;
    }
    @media print {
      body { padding: 0; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
  </style>
</head>
<body>

  <!-- Document header -->
  <div style="border-bottom:2px solid #1a2232;padding-bottom:14px;margin-bottom:20px;">
    <p style="margin:0 0 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#77b99b;">AI Insights · Flowboard</p>
    <h1 style="margin:0;font-size:22px;font-weight:800;color:#1a2232;">${esc(safeBoardName)} — Board Summary</h1>
    <div style="margin-top:8px;display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:#5a6a7e;">
      <span>Generated: ${esc(formatDate(safeGeneratedAt))}</span>
      ${taskMeta ? `<span>·</span><span>${esc(taskMeta)}</span>` : ''}
      ${confidenceStr ? `<span>·</span><span>${esc(confidenceStr)}</span>` : ''}
      <span>·</span><span style="color:#e67e22;font-weight:600;">AI-generated — verify before sharing</span>
    </div>
  </div>

  <!-- Executive summary -->
  ${section('Executive Summary', '#1a2232',
    `<p style="margin:0;font-size:14px;line-height:1.75;color:#1a2232;">${esc(executiveSummary)}</p>`
  )}

  <!-- Project overview -->
  ${projectOverview
    ? section('Project Overview', '#5a6a7e',
        `<p style="margin:0;font-size:13px;line-height:1.65;color:#3d4f63;">${esc(projectOverview)}</p>`)
    : ''}

  <!-- Two-column grid: completed + pending -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
    <div style="break-inside:avoid;border:1px solid #e8ecf0;border-radius:8px;">
      <div style="background:#27ae6018;border-bottom:1px solid #27ae6030;padding:10px 16px;">
        <h2 style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#27ae60;">Completed Work</h2>
      </div>
      <div style="padding:14px 16px;">${listItems(completedWork, '✓')}</div>
    </div>
    <div style="break-inside:avoid;border:1px solid #e8ecf0;border-radius:8px;">
      <div style="background:#e67e2218;border-bottom:1px solid #e67e2230;padding:10px 16px;">
        <h2 style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#d4820a;">Pending Work</h2>
      </div>
      <div style="padding:14px 16px;">${listItems(pendingWork, '○')}</div>
    </div>
  </div>

  <!-- Blockers -->
  ${section('Blockers & Risks', '#c0392b', listItems(blockers, '⚠'))}

  <!-- Priority recommendations -->
  ${section('Priority Recommendations', '#77b99b',
    priorityRecommendations.length
      ? recommendations
      : '<p style="color:#7f8c9e;font-size:13px;">No recommendations at this time.</p>'
  )}

  <!-- Footer -->
  <div style="margin-top:28px;padding-top:12px;border-top:1px solid #e8ecf0;font-size:10px;color:#9aabb8;display:flex;justify-content:space-between;">
    <span>Flowboard AI · Board Summary</span>
    <span>${esc(safeBoardName)} · ${esc(formatDate(safeGeneratedAt))}</span>
  </div>

</body>
</html>`;
}
