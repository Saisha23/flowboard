import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight, Bot, CheckCircle2, Clock, Copy, Download, Sparkles, XCircle, AlertCircle, Share2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card } from '@/components/ui';
import { useApp } from '@/hooks/useApp';
import { useToast } from '@/components/ui/Toast';
import { summaryService } from '@/services';
import { cx, priorityMeta } from '@/lib/utils';
import { exportSummaryPdf } from '@/lib/exportPdf';
import type { AISummary } from '@/types';

type State = 'empty' | 'fetching' | 'loading' | 'success' | 'error';

export function AISummaryPage() {
  const { boards, tasks, loading, error, workspace } = useApp();
  const { toast } = useToast();
  const [state, setState] = useState<State>('empty');
  const [summary, setSummary] = useState<AISummary | null>(null);
  const board = boards[0];

  useEffect(() => {
    if (loading || error || !workspace) return;
    const boardId = boards[0]?.id;
    if (!boardId) {
      setSummary(null);
      setState('empty');
      return;
    }

    let active = true;
    setSummary(null);
    setState('fetching');
    summaryService.get(boardId).then((s) => {
      if (!active) return;
      if (s) { setSummary(s); setState('success'); }
      else setState('empty');
    }).catch((cause) => {
      if (!active) return;
      setState('error');
      toast({ type: 'error', title: 'Could not load saved summary', message: cause instanceof Error ? cause.message : 'Please try again.' });
    });
    return () => { active = false; };
  }, [loading, error, workspace, boards, toast]);

  const generate = async () => {
    if (loading || error || !workspace) return;
    if (!board) {
      toast({ type: 'error', title: 'No board available', message: 'Create a board before generating a summary.' });
      return;
    }
    setState('loading');
    try {
      const s = await summaryService.generate(board.id);
      setSummary(s);
      setState('success');
      toast({ type: 'success', title: 'Summary generated', message: 'AI report ready to share.' });
    } catch (cause) {
      setState('error');
      toast({ type: 'error', title: 'Generation failed', message: cause instanceof Error ? cause.message : 'Please try again.' });
    }
  };

  const boardTasks = tasks.filter((task) => task.boardId === board?.id);
  const completedCount = boardTasks.filter((task) => task.completedAt).length;
  const summaryGeneratedAt = summary ? Date.parse(summary.generatedAt) : Number.NaN;
  const summaryIsStale = Number.isFinite(summaryGeneratedAt) && boardTasks.some((task) => {
    const taskUpdatedAt = Date.parse(task.updatedAt);
    return Number.isFinite(taskUpdatedAt) && taskUpdatedAt > summaryGeneratedAt;
  });

  const handleExportPdf = (report: AISummary) => {
    let initiated: boolean;
    try {
      initiated = exportSummaryPdf({
        summary: report,
        boardName: board?.name ?? 'Flowboard',
        generatedAt: report.generatedAt,
        taskCount: boardTasks.length,
        completedCount,
        confidence: report.confidence,
      });
    } catch (cause) {
      toast({
        type: 'error',
        title: 'Export failed',
        message: cause instanceof Error ? cause.message : 'Could not generate the PDF.',
      });
      return;
    }

    if (initiated) {
      toast({ type: 'success', title: 'Print dialog opened', message: 'Choose "Save as PDF" in the print dialog to download.' });
    } else {
      toast({ type: 'error', title: 'Export failed', message: 'Your browser blocked the PDF popup. Please allow popups for this site and try again.' });
    }
  };

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8 md:px-10">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">
            <Sparkles className="h-3.5 w-3.5 text-mint-500" /> AI Insights
          </p>
          <h1 className="mt-1.5 font-display text-display-md font-bold tracking-tightish text-midnight">Board summary</h1>
          <p className="mt-2 text-sm text-slatey">An executive-ready brief generated from your board's current state.</p>
        </div>
        <div className="flex items-center gap-2">
          {state === 'success' && summary && (
            <>
              <Button
                id="ai-summary-copy-btn"
                variant="outline"
                size="md"
                onClick={() => {
                  const text = [
                    summary.executiveSummary,
                    summary.projectOverview,
                    ...summary.completedWork,
                    ...summary.pendingWork,
                    ...summary.blockers,
                  ].join('\n\n');
                  navigator.clipboard.writeText(text).then(
                    () => toast({ type: 'info', title: 'Copied', message: 'Summary text copied to clipboard.' }),
                    () => toast({ type: 'error', title: 'Copy failed', message: 'Could not access the clipboard.' }),
                  );
                }}
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
              <Button
                id="ai-summary-export-top-btn"
                variant="outline"
                size="md"
                onClick={() => handleExportPdf(summary)}
              >
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            </>
          )}
          <Button variant="primary" size="md" onClick={generate} disabled={loading || Boolean(error) || !workspace || state === 'loading' || !board}>
            <Sparkles className="h-4 w-4" /> {state === 'success' ? 'Regenerate' : 'Generate summary'}
          </Button>
        </div>
      </div>

      {/* Meta strip */}
      {!loading && !error && workspace && board && <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-midnight/[0.07] bg-white px-4 py-3">
        <Link to={board ? `/app/boards/${board.id}` : '/app/boards'} className="flex items-center gap-2 text-sm font-semibold text-midnight hover:underline">
          {board?.name ?? 'No board selected'}
          <ArrowRight className="h-3 w-3" />
        </Link>
        <span className="text-slatey-300">·</span>
        <span className="text-2xs font-medium text-slatey-500">{boardTasks.length} tasks</span>
        <Badge tone="sage" dot>{completedCount} completed</Badge>
        {summary && (
          <>
            <span className="text-slatey-300">·</span>
            <span className="inline-flex items-center gap-1 text-2xs font-medium text-slatey-500">
              <Clock className="h-3 w-3" /> Last generated {new Date(summary.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
            {summary.confidence != null && (
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-mint-50 px-2.5 py-1 text-2xs font-semibold text-mint-500">
                <Bot className="h-3 w-3" /> {Math.round(summary.confidence * 100)}% confidence
              </span>
            )}
          </>
        )}
      </div>}

      {summaryIsStale && (
        <p role="status" className="mt-4 rounded-xl border border-amber/20 bg-amber/[0.06] px-4 py-3 text-sm text-midnight">
          Board tasks changed after this summary was generated. Select Regenerate to refresh AI Insights.
        </p>
      )}

      {loading ? (
        <p role="status" className="mt-6 text-sm text-slatey">Loading workspace data…</p>
      ) : error ? (
        <p role="alert" className="mt-6 rounded-xl border border-coral/20 bg-coral/[0.06] px-4 py-3 text-sm text-coral">{error}</p>
      ) : !workspace ? (
        <p role="status" className="mt-6 text-sm text-slatey">No workspace membership.</p>
      ) : !board ? (
        <p role="status" className="mt-6 text-sm text-slatey">No boards are available in this workspace.</p>
      ) : (
        <AnimatePresence mode="wait">
          {state === 'empty' && <EmptyState key="empty" onGenerate={generate} />}
          {state === 'fetching' && <p key="fetching" role="status" className="mt-6 text-sm text-slatey">Loading saved summary…</p>}
          {state === 'loading' && <LoadingState key="loading" />}
          {state === 'error' && <ErrorState key="error" onRetry={generate} />}
          {state === 'success' && summary && <SummaryReport key="success" summary={summary} onExportPdf={() => handleExportPdf(summary)} />}
        </AnimatePresence>
      )}
    </div>
  );
}

function EmptyState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mt-6 flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-midnight/10 bg-white/50 px-6 py-20 text-center"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-mint-50 text-mint-500">
        <Sparkles className="h-7 w-7" />
      </span>
      <h2 className="mt-5 font-display text-xl font-bold text-midnight">No summary yet</h2>
      <p className="mt-2 max-w-sm text-sm text-slatey">Generate an AI-powered brief covering completed work, pending items, blockers and prioritized recommendations.</p>
      <Button variant="primary" size="lg" className="mt-6" onClick={onGenerate}>
        <Sparkles className="h-4 w-4" /> Generate summary
      </Button>
    </motion.div>
  );
}

function LoadingState() {
  const steps = ['Reading board state', 'Analyzing drift signals', 'Drafting executive summary', 'Prioritizing recommendations'];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-6 space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-mint-300/30 bg-mint-50 p-4">
        <span className="relative flex h-8 w-8 items-center justify-center">
          <span className="absolute inset-0 animate-pulse-ring rounded-full bg-mint-200" />
          <Bot className="relative h-4 w-4 text-mint-500" />
        </span>
        <div>
          <p className="text-sm font-bold text-midnight">Generating summary…</p>
          <p className="text-2xs text-slatey">This usually takes a few seconds.</p>
        </div>
      </div>
      <div className="space-y-2">
        {steps.map((s, i) => (
          <motion.div
            key={s}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.5 }}
            className="flex items-center gap-2.5 rounded-xl bg-white px-4 py-3 text-sm text-slatey"
          >
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-mint-400"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
            {s}
          </motion.div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    </motion.div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-6 flex flex-col items-center justify-center rounded-3xl border border-coral/20 bg-coral/[0.04] px-6 py-20 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-coral/10 text-coral">
        <XCircle className="h-7 w-7" />
      </span>
      <h2 className="mt-5 font-display text-xl font-bold text-midnight">Generation failed</h2>
      <p className="mt-2 max-w-sm text-sm text-slatey">We couldn't generate the summary. Check your connection and try again.</p>
      <Button variant="primary" size="lg" className="mt-6" onClick={onRetry}>Try again</Button>
    </motion.div>
  );
}

function SummaryReport({ summary, onExportPdf }: { summary: AISummary; onExportPdf: () => void }) {
  const { toast } = useToast();

  const handleShareLink = () => {
    // Sharing requires workspace authentication. There is no public/token-based
    // sharing backend. We copy the authenticated app URL and inform the user
    // that the recipient must be a workspace member to access it.
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(
      () => toast({
        type: 'info',
        title: 'Link copied',
        message: 'Recipients must be workspace members and signed in to view this summary.',
      }),
      () => toast({
        type: 'error',
        title: 'Copy failed',
        message: 'Could not access the clipboard.',
      }),
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6 space-y-4"
    >
      {/* Executive summary */}
      <Card className="overflow-hidden">
        <div className="border-b border-midnight/8 bg-mint-50/60 px-6 py-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-widest2 text-mint-500">
              <Bot className="h-3.5 w-3.5" /> Executive summary
            </p>
            <span className="inline-flex items-center gap-1 text-2xs font-medium text-slatey-400">
              <AlertCircle className="h-3 w-3" /> AI-generated · verify before sharing
            </span>
          </div>
        </div>
        <p className="px-6 py-5 text-pretty text-base leading-relaxed text-midnight">{summary.executiveSummary}</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Project overview */}
        <Card hover>
          <SectionTitle icon={AlertCircle} label="Project overview" />
          <p className="px-6 pb-5 text-sm leading-relaxed text-slatey">{summary.projectOverview}</p>
        </Card>

        {/* Completed work */}
        <Card hover>
          <SectionTitle icon={CheckCircle2} label="Completed work" tone="sage" count={summary.completedWork.length} />
          <ul className="space-y-2 px-6 pb-5">
            {summary.completedWork.map((w, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-midnight">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sage" />
                {w}
              </li>
            ))}
          </ul>
        </Card>

        {/* Pending work */}
        <Card hover>
          <SectionTitle icon={Clock} label="Pending work" tone="amber" count={summary.pendingWork.length} />
          <ul className="space-y-2 px-6 pb-5">
            {summary.pendingWork.map((w, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-midnight">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
                {w}
              </li>
            ))}
          </ul>
        </Card>

        {/* Blockers */}
        <Card hover>
          <SectionTitle icon={XCircle} label="Blockers" tone="coral" count={summary.blockers.length} />
          <ul className="space-y-2 px-6 pb-5">
            {summary.blockers.map((w, i) => (
              <li key={i} className="flex items-start gap-2.5 rounded-lg bg-coral/[0.05] px-3 py-2 text-xs text-midnight">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-coral" />
                {w}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Priority recommendations */}
      <Card hover>
        <div className="flex items-center justify-between px-6 pb-3 pt-5">
          <SectionTitle icon={Sparkles} label="Priority recommendations" tone="mint" count={summary.priorityRecommendations.length} inline />
          <span className="inline-flex items-center gap-1 rounded-full bg-mint-50 px-2.5 py-1 text-2xs font-semibold text-mint-500">
            <Bot className="h-3 w-3" /> AI-prioritized
          </span>
        </div>
        <div className="space-y-2 px-4 pb-5">
          {summary.priorityRecommendations.map((r) => {
            const pm = priorityMeta[r.urgency];
            return (
              <div key={r.id} className="flex items-start gap-3 rounded-xl border border-midnight/[0.06] bg-white p-4">
                <span className={cx('mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide2', pm.pill)}>
                  <span className={cx('h-1.5 w-1.5 rounded-full', pm.dot)} />
                  {pm.label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-midnight">{r.title}</p>
                  <p className="mt-1 text-2xs leading-relaxed text-slatey">{r.reasoning}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Share / export bar */}
      <div className="flex items-center justify-between rounded-2xl border border-midnight/[0.07] bg-white px-5 py-4">
        <p className="text-sm text-slatey">This summary is easy to share with stakeholders.</p>
        <div className="flex gap-2">
          <Button
            id="ai-summary-share-btn"
            variant="outline"
            size="sm"
            onClick={handleShareLink}
          >
            <Share2 className="h-3.5 w-3.5" /> Share link
          </Button>
          <Button
            id="ai-summary-export-bottom-btn"
            variant="secondary"
            size="sm"
            onClick={onExportPdf}
          >
            <Download className="h-3.5 w-3.5" /> Export PDF
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function SectionTitle({ icon: Icon, label, tone = 'slatey', count, inline }: { icon: typeof Bot; label: string; tone?: 'slatey' | 'sage' | 'amber' | 'coral' | 'mint'; count?: number; inline?: boolean }) {
  const toneClass = {
    slatey: 'text-slatey-500 bg-slatey-100',
    sage: 'text-sage bg-sage/12',
    amber: 'text-amber bg-amber/12',
    coral: 'text-coral bg-coral/10',
    mint: 'text-mint-500 bg-mint-50',
  }[tone];
  return (
    <div className={cx('flex items-center gap-2', inline ? '' : 'px-6 pt-5')}>
      <span className={cx('flex h-7 w-7 items-center justify-center rounded-lg', toneClass)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <h3 className="font-display text-sm font-bold text-midnight">{label}</h3>
      {count !== undefined && <span className="rounded-full bg-midnight/5 px-1.5 py-0.5 text-2xs font-semibold text-slatey-400">{count}</span>}
    </div>
  );
}
