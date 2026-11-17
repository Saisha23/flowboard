import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Calendar, CheckCircle2, Clock, Plus, TrendingUp } from 'lucide-react';
import { Avatar, Badge } from '@/components/ui';
import { cx, priorityMeta, riskMeta } from '@/lib/utils';

// A polished, self-contained preview of the product UI used on the landing page.
// Visually representative — not wired to real data.

interface PreviewCard {
  id: string;
  title: string;
  priority: string;
  due: string;
  assignees: string[];
  colors: string[];
  overdue?: boolean;
  done?: boolean;
}

interface PreviewList {
  id: string;
  name: string;
  tone: string;
  cards: PreviewCard[];
}

const previewLists: PreviewList[] = [
  {
    id: 'pl1',
    name: 'In Progress',
    tone: 'mint',
    cards: [
      { id: 'pc1', title: 'Offline sync architecture', priority: 'HIGH', due: 'In 2 days', assignees: ['MW', 'PN'], colors: ['#77B99B', '#C17F5C'] },
      { id: 'pc2', title: 'Onboarding flow — visual design', priority: 'URGENT', due: '1 day overdue', overdue: true, assignees: ['TO'], colors: ['#777C8E'] },
    ],
  },
  {
    id: 'pl2',
    name: 'Review',
    tone: 'amber',
    cards: [
      { id: 'pc3', title: 'Accessibility audit — navigation', priority: 'MEDIUM', due: 'Tomorrow', assignees: ['TO'], colors: ['#777C8E'] },
      { id: 'pc4', title: 'App Store screenshots', priority: 'MEDIUM', due: 'In 3 days', assignees: ['TO'], colors: ['#777C8E'] },
    ],
  },
  {
    id: 'pl3',
    name: 'Done',
    tone: 'sage',
    cards: [
      { id: 'pc5', title: 'Analytics event taxonomy', priority: 'MEDIUM', due: 'Shipped', done: true, assignees: ['LS', 'MW'], colors: ['#E2B65C', '#77B99B'] },
    ],
  },
];

export function DashboardPreview({ className }: { className?: string }) {
  return (
    <div className={cx('relative overflow-hidden rounded-3xl border border-midnight/10 bg-white shadow-lift', className)}>
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-midnight/8 bg-porcelain-50 px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-coral/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-sage/70" />
        </div>
        <div className="ml-3 flex items-center gap-1.5 text-2xs font-medium text-slatey-400">
          <span className="h-1.5 w-1.5 rounded-full bg-sage" />
          flowboard.ai/atlas-studio/q4-launch
        </div>
      </div>

      <div className="flex">
        {/* Mini sidebar */}
        <div className="hidden w-44 shrink-0 border-r border-midnight/8 bg-midnight p-3 md:block">
          <div className="flex items-center gap-2 px-1.5 py-1">
            <span className="h-5 w-5 rounded-md bg-mint-200" />
            <span className="text-2xs font-bold text-white">Atlas Studio</span>
          </div>
          <div className="mt-4 space-y-0.5">
            {['Overview', 'Boards', 'Drift Radar', 'AI Insights', 'Team'].map((n, i) => (
              <div
                key={n}
                className={cx(
                  'rounded-md px-2 py-1.5 text-2xs font-medium',
                  i === 1 ? 'bg-white/10 text-white' : 'text-white/50',
                )}
              >
                {n}
              </div>
            ))}
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 bg-porcelain-50 p-4">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">Board</p>
              <p className="font-display text-sm font-bold text-midnight">Q4 Launch — Mobile App</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge tone="apricot" dot>At Risk</Badge>
              <span className="rounded-md bg-mint-200 px-2 py-1 text-2xs font-bold text-midnight">+ Add</span>
            </div>
          </div>

          {/* Kanban */}
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            {previewLists.map((col) => (
              <div key={col.id} className="space-y-2">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-2xs font-semibold uppercase tracking-wide2 text-slatey-500">{col.name}</span>
                  <span className="text-2xs text-slatey-400">{col.cards.length}</span>
                </div>
                {col.cards.map((c) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 6 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="rounded-lg border border-midnight/8 bg-white p-2.5 shadow-soft"
                  >
                    <div className="flex items-center justify-between">
                      <span className={cx('h-1.5 w-1.5 rounded-full', priorityMeta[c.priority as keyof typeof priorityMeta].dot)} />
                      {c.done && <CheckCircle2 className="h-3 w-3 text-sage" />}
                    </div>
                    <p className={cx('mt-1.5 text-2xs font-semibold leading-snug text-midnight', c.done && 'text-slatey-400 line-through')}>
                      {c.title}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span
                        className={cx(
                          'inline-flex items-center gap-1 text-[10px] font-medium',
                          c.overdue ? 'text-coral' : c.done ? 'text-sage' : 'text-slatey-400',
                        )}
                      >
                        {c.overdue ? <AlertTriangle className="h-2.5 w-2.5" /> : c.done ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Calendar className="h-2.5 w-2.5" />}
                        {c.due}
                      </span>
                      <div className="flex -space-x-1">
                        {c.assignees.map((a, i) => (
                          <Avatar key={i} initials={a} color={c.colors[i]} size="xs" ring />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ))}
          </div>

          {/* Drift strip */}
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-midnight/8 bg-white p-2.5">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-apricot-400" />
              <span className="text-2xs font-semibold text-midnight">Drift score</span>
            </div>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slatey-100">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-amber to-coral"
                initial={{ width: 0 }}
                whileInView={{ width: '62%' }}
                viewport={{ once: true }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
            </div>
            <span className="text-2xs font-bold text-apricot-400">62</span>
            <span className={cx('text-2xs font-semibold', riskMeta.AT_RISK.text)}>At Risk</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DriftRadarPreview({ className }: { className?: string }) {
  const factors = [
    { label: 'Overdue tasks', score: 22, tone: 'coral' as const },
    { label: 'Deadline churn', score: 16, tone: 'amber' as const },
    { label: 'Dependency bottleneck', score: 18, tone: 'coral' as const },
    { label: 'Stagnant tasks', score: 12, tone: 'amber' as const },
  ];

  return (
    <div className={cx('rounded-3xl border border-midnight/10 bg-midnight p-6 text-white shadow-lift', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-widest2 text-mint-200">Commitment Drift Radar</p>
          <p className="mt-1 font-display text-lg font-bold">Q4 Launch — Mobile App</p>
        </div>
        <Badge tone="apricot" dot>At Risk</Badge>
      </div>

      {/* Score ring */}
      <div className="mt-6 flex items-center gap-6">
        <ScoreRing score={62} />
        <div className="flex-1 space-y-2.5">
          {factors.map((f) => (
            <div key={f.label}>
              <div className="flex items-center justify-between text-2xs">
                <span className="text-white/70">{f.label}</span>
                <span className="font-semibold text-white">{f.score}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className={cx('h-full rounded-full', f.tone === 'coral' ? 'bg-coral' : 'bg-amber')}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${f.score * 3}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1 }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trend */}
      <div className="mt-6 rounded-xl bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <span className="text-2xs font-semibold uppercase tracking-wide2 text-white/60">14-day drift trend</span>
          <span className="inline-flex items-center gap-1 text-2xs font-semibold text-coral">
            <TrendingUp className="h-3 w-3" /> +24 pts
          </span>
        </div>
        <svg viewBox="0 0 240 60" className="mt-3 w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D69A78" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#D69A78" stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path
            d="M0,40 L40,38 L80,32 L120,24 L160,18 L200,14 L240,10 L240,60 L0,60 Z"
            fill="url(#trendFill)"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1 }}
          />
          <motion.path
            d="M0,40 L40,38 L80,32 L120,24 L160,18 L200,14 L240,10"
            fill="none"
            stroke="#D69A78"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
          />
        </svg>
      </div>

      {/* AI recommendation */}
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-mint-300/20 bg-mint-300/10 p-3.5">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-mint-200 text-2xs font-bold text-midnight">AI</span>
        <div>
          <p className="text-xs font-semibold text-white">Unblock the sync architecture today</p>
          <p className="mt-0.5 text-2xs text-white/60">It gates 16+ hours of downstream work and is the root cause of the dependency bottleneck.</p>
        </div>
      </div>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <motion.circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="#D69A78"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          whileInView={{ strokeDashoffset: c - (score / 100) * c }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-bold text-white">{score}</span>
        <span className="text-2xs text-white/50">drift</span>
      </div>
    </div>
  );
}

export function MiniStat({ icon: Icon, label, value, tone = 'midnight' }: { icon: typeof Plus; label: string; value: string; tone?: 'midnight' | 'mint' | 'apricot' | 'coral' }) {
  const toneClass = {
    midnight: 'text-midnight',
    mint: 'text-mint-500',
    apricot: 'text-apricot-400',
    coral: 'text-coral',
  }[tone];
  return (
    <div className="rounded-xl border border-midnight/[0.07] bg-white p-4">
      <div className="flex items-center justify-between">
        <Icon className={cx('h-4 w-4', toneClass)} />
        <Clock className="h-3 w-3 text-slatey-300" />
      </div>
      <p className="mt-3 font-display text-xl font-bold text-midnight">{value}</p>
      <p className="text-2xs font-medium text-slatey">{label}</p>
    </div>
  );
}

export function CTAArrow({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group inline-flex items-center gap-1.5 text-sm font-semibold text-midnight"
    >
      {label}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
    </button>
  );
}
