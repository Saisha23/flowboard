import { motion } from 'framer-motion';
import {
  AlertTriangle, ArrowUpRight, Bot, CalendarClock, GitBranch, Info, Radar, Sparkles, TrendingUp, Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Badge, Button, Card } from '@/components/ui';
import { ProgressBar } from '@/components/ui/Progress';
import { ActivityFeed } from '@/components/shared/ActivityFeed';
import { useApp } from '@/hooks/useApp';
import { driftService } from '@/services';
import { cx, riskMeta } from '@/lib/utils';
import type { DriftSnapshot, RiskFactor, RiskLevel, Task } from '@/types';

const riskBadgeTone: Record<RiskLevel, 'sage' | 'amber' | 'apricot' | 'coral'> = {
  HEALTHY: 'sage',
  WATCH: 'amber',
  AT_RISK: 'apricot',
  CRITICAL: 'coral',
};

const categoryMeta: Record<RiskFactor['category'], { icon: typeof Radar; label: string }> = {
  overdue: { icon: CalendarClock, label: 'Overdue tasks' },
  approaching_deadline: { icon: CalendarClock, label: 'Approaching deadlines' },
  priority: { icon: AlertTriangle, label: 'High-priority work' },
  deadline_churn: { icon: AlertTriangle, label: 'Deadline churn' },
  stagnation: { icon: TrendingUp, label: 'Stagnation' },
  dependency_bottleneck: { icon: GitBranch, label: 'Dependency bottleneck' },
  workload: { icon: Users, label: 'Workload' },
  other: { icon: Info, label: 'Other risk signal' },
};

const effortMeta = { LOW: { label: 'Low effort', color: 'text-sage' }, MEDIUM: { label: 'Medium effort', color: 'text-amber' }, HIGH: { label: 'High effort', color: 'text-coral' } };
const impactMeta = { LOW: { label: 'Low impact', color: 'text-slatey-400' }, MEDIUM: { label: 'Medium impact', color: 'text-amber' }, HIGH: { label: 'High impact', color: 'text-mint-500' } };

export function DriftRadarPage() {
  const { users, tasks, boards, loading: appLoading, error: appError, workspace } = useApp();
  const [snapshot, setSnapshot] = useState<DriftSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (appLoading || appError || !workspace) return;
    const boardId = boards[0]?.id;
    if (!boardId) {
      setLoading(false);
      setSnapshot(null);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    driftService.snapshot(boardId).then((s) => {
      if (!active) return;
      setSnapshot(s);
      setLoading(false);
    }).catch((cause) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : 'Unable to load drift analytics.');
      setLoading(false);
    });
    return () => { active = false; };
  }, [appLoading, appError, workspace, boards]);

  const evaluate = async () => {
    const boardId = boards[0]?.id;
    if (!boardId) return;
    setEvaluating(true);
    try {
      setSnapshot(await driftService.evaluate(boardId));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save drift evaluation.');
    } finally {
      setEvaluating(false);
    }
  };

  if (appLoading || loading) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-8 md:px-10">
        <div className="skeleton h-8 w-64" />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="skeleton h-48 rounded-2xl" />
          <div className="skeleton h-48 rounded-2xl lg:col-span-2" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (appError) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-8 md:px-10">
        <p role="alert" className="rounded-2xl border border-coral/20 bg-coral/[0.06] p-5 text-sm text-coral">{appError}</p>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-8 md:px-10">
        <p role="status" className="text-sm text-slatey">No workspace membership.</p>
      </div>
    );
  }

  if (!boards.length) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-8 md:px-10">
        <p role="status" className="text-sm text-slatey">No boards are available in this workspace.</p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-8 md:px-10">
        <div role="alert" className="rounded-2xl border border-coral/20 bg-coral/[0.06] p-5 text-sm text-coral">
          {error ?? 'Drift analytics unavailable.'}
        </div>
        <Button className="mt-4" variant="primary" size="md" onClick={evaluate} disabled={evaluating}>
          {evaluating ? 'Evaluating…' : 'Evaluate drift'}
        </Button>
      </div>
    );
  }

  const rm = riskMeta[snapshot.health];
  const taskById = (id: string) => tasks.find((t) => t.id === id);
  const hasAiRecommendations = snapshot.recoveryActions.some((action) => action.aiGenerated);

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8 md:px-10">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">
            <Radar className="h-3.5 w-3.5" /> Signature feature
          </p>
          <h1 className="mt-1.5 font-display text-display-md font-bold tracking-tightish text-midnight">Commitment Drift Radar</h1>
          <p className="mt-2 max-w-xl text-sm text-slatey">Deterministic signals read from your board, explained by AI. Not a vanity dashboard — every number traces back to a task.</p>
        </div>
        {error && <p role="alert" className="mt-3 text-xs text-coral">{error}</p>}
        <div className="flex items-center gap-2">
          <Badge tone={riskBadgeTone[snapshot.health]} dot>{rm.label}</Badge>
          <span className="text-2xs text-slatey-400">Updated {new Date(snapshot.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
          <Button variant="outline" size="sm" onClick={evaluate} disabled={evaluating}>
            {evaluating ? 'Evaluating…' : 'Re-evaluate'}
          </Button>
        </div>
      </div>

      {/* Top row: score + trend */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Score card */}
        <Card className="overflow-hidden">
          <div className="bg-midnight p-6 text-white">
            <p className="text-2xs font-semibold uppercase tracking-widest2 text-white/50">Overall drift score</p>
            <div className="mt-4 flex items-center gap-5">
              <ScoreRingDark score={snapshot.driftScore} />
              <div>
                <p className="font-display text-2xl font-bold" style={{ color: rm.color }}>{rm.label}</p>
                <p className="mt-1 text-2xs leading-relaxed text-white/60">Higher = more drift. Score is the sum of risk-factor contributions.</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-midnight/5">
            {[
              { label: 'Factors', value: snapshot.factors.length },
              { label: 'Evidence', value: snapshot.factors.reduce((a, f) => a + f.evidenceCount, 0) },
              { label: 'Actions', value: snapshot.recoveryActions.length },
            ].map((s) => (
              <div key={s.label} className="px-4 py-3 text-center">
                <p className="font-display text-xl font-bold text-midnight">{s.value}</p>
                <p className="text-2xs font-medium text-slatey-400">{s.label}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Trend chart */}
        <Card className="lg:col-span-2" hover>
          <div className="flex items-center justify-between px-6 pt-5">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">14-day drift trend</p>
              <p className="mt-1 font-display text-base font-bold text-midnight">Rising — up 24 points in two weeks</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-coral/10 px-2.5 py-1 text-2xs font-semibold text-coral">
              <TrendingUp className="h-3 w-3" /> +24
            </span>
          </div>
          <TrendChart points={snapshot.trend} />
        </Card>
      </div>

      {/* Legend: how to read this */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-midnight/[0.07] bg-white px-4 py-3">
        <Info className="h-4 w-4 text-slatey-400" />
        <span className="text-2xs font-semibold uppercase tracking-wide2 text-slatey-400">How to read this:</span>
        <LegendItem swatch="bg-white border border-midnight/15" label="Project data" />
        <LegendItem swatch="bg-amber" label="Risk signal" />
        <LegendItem swatch="bg-mint-200" label="AI explanation" />
        <LegendItem swatch="bg-apricot-200" label="Recommended action" />
      </div>

      {/* Risk factor cards */}
      <div className="mt-6">
        <h2 className="font-display text-lg font-bold text-midnight">Risk factors</h2>
        <p className="text-sm text-slatey">Each factor contributes to the drift score. Expand evidence to see the exact tasks.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {snapshot.factors.map((f, i) => (
            <RiskFactorCard key={f.id} factor={f} taskById={taskById} delay={i * 0.05} />
          ))}
        </div>
      </div>

      {/* Workload + Recovery actions */}
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {/* Workload */}
        <Card className="lg:col-span-1" hover>
          <CardHeader title="Workload distribution" subtitle="Open tasks per person" />
          <div className="space-y-3 px-6 pb-6">
            {snapshot.workload.map((w) => {
              const pct = Math.min(100, Math.round((w.openTasks / w.capacity) * 100));
              return (
                <div key={w.userId}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar initials={w.initials} color={w.color} size="sm" />
                      <span className="text-xs font-semibold text-midnight">{w.userName}</span>
                    </div>
                    <span className={cx('text-2xs font-semibold', w.overdueTasks > 0 ? 'text-coral' : 'text-slatey-400')}>
                      {w.openTasks}/{w.capacity}
                      {w.overdueTasks > 0 && ` · ${w.overdueTasks} overdue`}
                    </span>
                  </div>
                  <ProgressBar
                    value={pct}
                    className="mt-1.5"
                    color={pct > 90 ? 'bg-coral' : pct > 75 ? 'bg-amber' : 'bg-mint-300'}
                  />
                </div>
              );
            })}
          </div>
        </Card>

        {/* Recovery actions */}
        <Card className="lg:col-span-2" hover>
          <CardHeader
            title="Recommended recovery actions"
            subtitle="Prioritized by impact"
            action={snapshot.recoveryActions.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-mint-50 px-2.5 py-1 text-2xs font-semibold text-mint-500">
                {hasAiRecommendations ? <Sparkles className="h-3 w-3" /> : <Info className="h-3 w-3" />}
                {hasAiRecommendations ? 'AI-assisted' : 'Evidence-based'}
              </span>
            )}
          />
          <div className="space-y-2.5 px-4 pb-5">
            {snapshot.recoveryActions.length === 0 ? (
              <p role="status" className="px-2 py-2 text-sm text-slatey">No recovery actions are recommended for the current risk signals.</p>
            ) : snapshot.recoveryActions.map((a) => (
              <div key={a.id} className="rounded-xl border border-apricot/20 bg-apricot/[0.05] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-apricot-50 text-apricot-400">
                      {a.aiGenerated ? <Bot className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-midnight">{a.title}</p>
                      <p className="mt-1 text-2xs leading-relaxed text-slatey">{a.rationale}</p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <span className={cx('inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold', effortMeta[a.effort].color)}>
                          {effortMeta[a.effort].label}
                        </span>
                        <span className={cx('inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold', impactMeta[a.impact].color)}>
                          {impactMeta[a.impact].label}
                        </span>
                        {a.relatedTaskIds.slice(0, 2).map((tid) => {
                          const t = taskById(tid);
                          if (!t) return null;
                          return (
                            <Link key={tid} to={`/app/boards/${t.boardId}`} className="rounded-full bg-midnight/5 px-2 py-0.5 text-[10px] font-medium text-slatey-500 hover:bg-midnight/10">
                              {t.title.slice(0, 24)}…
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-slatey-300" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Activity history */}
      <Card className="mt-4" hover>
        <CardHeader title="Activity history" subtitle="Events that shaped the current drift" />
        <div className="px-3 pb-5">
          {snapshot.activity.length > 0
            ? <ActivityFeed items={snapshot.activity} users={users} />
            : <p role="status" className="px-2 py-2 text-sm text-slatey">No drift events have been recorded yet.</p>}
        </div>
      </Card>
    </div>
  );
}

function RiskFactorCard({ factor, taskById, delay }: { factor: RiskFactor; taskById: (id: string) => Task | undefined; delay: number }) {
  const [expanded, setExpanded] = useState(false);
  const rm = riskMeta[factor.severity];
  const meta = categoryMeta[factor.category] ?? categoryMeta.other;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="overflow-hidden rounded-2xl border border-midnight/[0.07] bg-white shadow-soft"
    >
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-start gap-3 p-5 text-left">
        <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', rm.bg, rm.text)}>
          <meta.icon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-sm font-bold text-midnight">{factor.label}</h3>
            <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide2', rm.bg, rm.text)}>{rm.label}</span>
          </div>
          <p className="mt-1 text-2xs leading-relaxed text-slatey">{factor.description}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-2xl font-bold" style={{ color: rm.color }}>+{factor.score}</p>
          <p className="text-2xs text-slatey-400">to drift</p>
        </div>
      </button>

      {/* Score bar */}
      <div className="px-5">
        <div className="h-1 overflow-hidden rounded-full bg-midnight/5">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: rm.color }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, factor.score * 3.5)}%` }}
            transition={{ duration: 0.8, delay }}
          />
        </div>
      </div>

      {expanded && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="border-t border-midnight/5">
          <div className="space-y-2 p-5">
            <p className="text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">Task-level evidence ({factor.evidenceCount})</p>
            {factor.evidence.map((ev, i) => {
              const t = taskById(ev.taskId);
              return (
                <div key={i} className="rounded-xl bg-porcelain-50 p-3">
                  <div className="flex items-center justify-between">
                    <Link to={t ? `/app/boards/${t.boardId}` : '#'} className="text-xs font-bold text-midnight hover:underline">
                      {ev.taskTitle}
                    </Link>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-amber">{ev.metric}</span>
                  </div>
                  <p className="mt-1 text-2xs text-slatey">{ev.detail}</p>
                  <p className="mt-1.5 text-[10px] font-medium text-slatey-400">Owner: {ev.assigneeName}</p>
                </div>
              );
            })}

            {/* AI recommendation */}
            <div className={cx('mt-3 rounded-xl border p-3.5', factor.aiGenerated ? 'border-mint-300/30 bg-mint-50' : 'border-midnight/8 bg-white')}>
              <p className={cx('flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide2', factor.aiGenerated ? 'text-mint-500' : 'text-slatey-500')}>
                {factor.aiGenerated ? <><Bot className="h-3.5 w-3.5" /> AI recommendation</> : <><Info className="h-3.5 w-3.5" /> Recommendation</>}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-midnight">{factor.recommendation}</p>
            </div>
          </div>
        </motion.div>
      )}

      {!expanded && (
        <button onClick={() => setExpanded(true)} className="w-full border-t border-midnight/5 px-5 py-2.5 text-2xs font-semibold text-slatey-400 transition-colors hover:bg-midnight/[0.02] hover:text-midnight">
          View {factor.evidenceCount} evidence + recommendation
        </button>
      )}
    </motion.div>
  );
}

function TrendChart({ points }: { points: { date: string; score: number }[] }) {
  const w = 600;
  const h = 140;
  const pad = 24;
  const max = 100;
  const stepX = (w - pad * 2) / Math.max(points.length - 1, 1);
  const coords = points.map((p, i) => ({ x: pad + i * stepX, y: h - pad - (p.score / max) * (h - pad * 2), ...p }));
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
  const area = `${line} L${coords[coords.length - 1].x},${h - pad} L${coords[0].x},${h - pad} Z`;

  return (
    <div className="px-4 pb-5 pt-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" style={{ height: 160 }}>
        <defs>
          <linearGradient id="driftArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D69A78" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#D69A78" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={pad} y1={h - pad - (g / max) * (h - pad * 2)} x2={w - pad} y2={h - pad - (g / max) * (h - pad * 2)} stroke="rgba(17,24,32,0.06)" strokeWidth="1" />
            <text x={6} y={h - pad - (g / max) * (h - pad * 2) + 3} fontSize="9" fill="#777C8E">{g}</text>
          </g>
        ))}
        <motion.path d={area} fill="url(#driftArea)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }} />
        <motion.path d={line} fill="none" stroke="#D69A78" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: 'easeOut' }} />
        {coords.map((c, i) => (
          <g key={i}>
            <motion.circle cx={c.x} cy={c.y} r="3.5" fill="white" stroke="#D69A78" strokeWidth="2" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6 + i * 0.08 }} />
            <text x={c.x} y={h - 6} fontSize="9" fill="#777C8E" textAnchor="middle">{c.date}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function ScoreRingDark({ score }: { score: number }) {
  const size = 96;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#D69A78"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (score / 100) * c }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-bold text-white">{score}</span>
        <span className="text-2xs text-white/40">/ 100</span>
      </div>
    </div>
  );
}

function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between px-6 pb-4 pt-5">
      <div>
        <p className="text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">{title}</p>
        {subtitle && <h2 className="mt-1 font-display text-base font-bold text-midnight">{subtitle}</h2>}
      </div>
      {action}
    </div>
  );
}

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-2xs font-medium text-slatey-500">
      <span className={cx('h-2.5 w-2.5 rounded-sm', swatch)} />
      {label}
    </span>
  );
}
