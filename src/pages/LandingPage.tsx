import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  GitBranch,
  Layers,
  LineChart,
  Lock,
  Menu,
  Radar,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { Badge } from '@/components/ui/Badge';
import { DashboardPreview, DriftRadarPreview } from '@/components/landing/DashboardPreview';
import { cx } from '@/lib/utils';

export function LandingPage() {
  const [mobileNav, setMobileNav] = useState(false);
  return (
    <div className="min-h-screen bg-porcelain text-midnight">
      <LandingNav onOpenMobile={() => setMobileNav(true)} />
      {mobileNav && <MobileNav onClose={() => setMobileNav(false)} />}
      <Hero />
      <Capabilities />
      <DriftRadarSection />
      <HowItWorks />
      <FinalCTA />
      <Footer />
    </div>
  );
}

function LandingNav({ onOpenMobile }: { onOpenMobile: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-midnight/8 bg-porcelain/85 backdrop-blur-xl">
      <div className="container-wide flex h-16 items-center justify-between">
        <Logo />
        <nav className="hidden items-center gap-8 md:flex">
          <a href="#product" className="text-sm font-medium text-slatey transition-colors hover:text-midnight">Product</a>
          <a href="#features" className="text-sm font-medium text-slatey transition-colors hover:text-midnight">Features</a>
          <a href="#how-it-works" className="text-sm font-medium text-slatey transition-colors hover:text-midnight">How it works</a>
          <a href="#drift-radar" className="text-sm font-medium text-slatey transition-colors hover:text-midnight">Drift Radar</a>
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link to="/app"><Button variant="ghost" size="md">Sign in</Button></Link>
          <Link to="/app"><Button variant="primary" size="md">Get started <ArrowRight className="h-4 w-4" /></Button></Link>
        </div>
        <button onClick={onOpenMobile} className="flex h-9 w-9 items-center justify-center rounded-lg text-midnight md:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}

function MobileNav({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-midnight/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        className="absolute right-0 top-0 h-full w-72 bg-porcelain p-6"
      >
        <div className="flex items-center justify-between">
          <Logo />
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <nav className="mt-8 flex flex-col gap-1">
          {['Product', 'Features', 'How it works', 'Drift Radar'].map((n) => (
            <a key={n} href={`#${n.toLowerCase().replace(/ /g, '-')}`} onClick={onClose} className="rounded-lg px-3 py-3 text-sm font-medium text-midnight hover:bg-midnight/5">{n}</a>
          ))}
        </nav>
        <div className="mt-6 flex flex-col gap-2">
          <Link to="/app"><Button variant="outline" className="w-full">Sign in</Button></Link>
          <Link to="/app"><Button variant="primary" className="w-full">Get started</Button></Link>
        </div>
      </motion.div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 grid-noise opacity-60" aria-hidden />
      <div className="absolute -top-32 right-0 h-[480px] w-[480px] rounded-full bg-mint-200/40 blur-3xl" aria-hidden />
      <div className="absolute -bottom-40 -left-20 h-[420px] w-[420px] rounded-full bg-apricot/15 blur-3xl" aria-hidden />

      <div className="container-wide relative pt-16 pb-24 md:pt-24 md:pb-32">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-midnight/10 bg-white/70 px-3 py-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-mint-200 text-2xs font-bold text-midnight">AI</span>
              <span className="text-2xs font-semibold uppercase tracking-wide2 text-slatey">Now with Commitment Drift Radar</span>
            </div>

            <h1 className="mt-6 font-display text-[2.75rem] font-bold leading-[1.04] tracking-tightish text-midnight md:text-display-md">
              Projects don't fail<br />overnight. They <span className="relative">
                <span className="relative z-10 text-apricot-400">drift.</span>
                <motion.span
                  className="absolute -bottom-1 left-0 h-3 w-full rounded bg-mint-200/60"
                  initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.5, duration: 0.6 }}
                  style={{ originX: 0 }}
                />
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-slatey">
              Flowboard helps teams see what's moving, understand what's stuck and identify delivery risks before they become problems.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/app"><Button variant="primary" size="lg">Start your workspace <ArrowRight className="h-4 w-4" /></Button></Link>
              <Link to="/app"><Button variant="outline" size="lg">Explore the product</Button></Link>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-2xs font-medium text-slatey">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-sage" /> No credit card required</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-sage" /> Free for teams up to 5</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-sage" /> SOC 2 Type II</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="relative"
          >
            <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-mint-200/30 to-apricot/10 blur-2xl" aria-hidden />
            <DashboardPreview className="relative" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Capabilities() {
  const features = [
    {
      icon: Layers,
      title: 'Intelligent Kanban boards',
      body: 'Boards that reflect how teams actually work. Drag, prioritize and assign with interactions that feel instant.',
      accent: 'mint',
    },
    {
      icon: Sparkles,
      title: 'AI-powered project summaries',
      body: 'Generate executive-ready briefs covering completed work, pending items, blockers and recommendations.',
      accent: 'apricot',
    },
    {
      icon: Lock,
      title: 'Role-based team collaboration',
      body: 'Owners, members and viewers. Permissions enforced at the board, list and task level.',
      accent: 'slatey',
    },
    {
      icon: Radar,
      title: 'Commitment Drift Radar',
      body: 'A signal layer over your board. Spot overdue work, deadline churn, stagnation and bottlenecks before they escalate.',
      accent: 'coral',
      featured: true,
    },
  ];

  return (
    <section id="features" className="relative py-24 md:py-28">
      <div className="container-wide">
        <div className="max-w-2xl">
          <p className="eyebrow">Capabilities</p>
          <h2 className="mt-3 font-display text-display-md font-bold tracking-tightish text-midnight">
            Everything a delivery team needs. Nothing it doesn't.
          </h2>
          <p className="mt-4 text-pretty text-lg text-slatey">
            Four capabilities, woven together. The board is the source of truth; the intelligence layer is what makes it proactive.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className={cx(
                'group relative rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1',
                f.featured
                  ? 'border-midnight bg-midnight text-white hover:shadow-lift'
                  : 'border-midnight/[0.08] bg-white hover:shadow-card',
              )}
            >
              <div className={cx(
                'flex h-10 w-10 items-center justify-center rounded-xl',
                f.featured ? 'bg-mint-200/15 text-mint-200' : 'bg-mint-50 text-mint-500',
              )}>
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className={cx('mt-5 font-display text-lg font-bold', f.featured ? 'text-white' : 'text-midnight')}>{f.title}</h3>
              <p className={cx('mt-2 text-sm leading-relaxed', f.featured ? 'text-white/70' : 'text-slatey')}>{f.body}</p>
              {f.featured && (
                <span className="mt-4 inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide2 text-mint-200">
                  Signature feature <ArrowRight className="h-3 w-3" />
                </span>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DriftRadarSection() {
  return (
    <section id="drift-radar" className="relative overflow-hidden bg-midnight py-24 text-white md:py-32">
      <div className="absolute inset-0 bg-midnight-grain opacity-50" aria-hidden />
      <div className="absolute -right-40 top-0 h-[500px] w-[500px] rounded-full bg-mint-300/10 blur-3xl" aria-hidden />
      <div className="container-wide relative">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-widest2 text-mint-200">Commitment Drift Radar</p>
            <h2 className="mt-3 font-display text-display-md font-bold tracking-tightish">
              See the drift before<br />it becomes a delay.
            </h2>
            <p className="mt-5 max-w-lg text-pretty text-lg leading-relaxed text-white/70">
              Most dashboards tell you what already went wrong. The Drift Radar watches the slow accumulation of small signals — a deadline moved twice, a task idle for five days, a single task gating half the board.
            </p>

            <div className="mt-8 space-y-4">
              {[
                { icon: CalendarClock, title: 'Overdue & deadline churn', body: 'Tasks that slipped, and tasks whose due date keeps moving.' },
                { icon: TrendingDown, title: 'Stagnation detection', body: 'Work sitting untouched in active columns.' },
                { icon: GitBranch, title: 'Dependency bottlenecks', body: 'One task quietly blocking many downstream.' },
                { icon: LineChart, title: 'Workload distribution', body: 'Concentration risk across your team.' },
              ].map((row) => (
                <div key={row.title} className="flex gap-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/8 text-mint-200">
                    <row.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">{row.title}</p>
                    <p className="text-sm text-white/60">{row.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-mint-300/30 bg-mint-300/10 px-3 py-1.5 text-2xs font-semibold text-mint-200">
                <Bot className="h-3.5 w-3.5" /> AI explains the signal
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-2xs font-semibold text-white/70">
                <ShieldCheck className="h-3.5 w-3.5" /> Deterministic by default
              </span>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <DriftRadarPreview />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: '01', title: 'Bring your board', body: 'Create lists and tasks, assign owners and set deadlines. Flowboard stays out of the way until it has something useful to say.' },
    { n: '02', title: 'Let the radar watch', body: 'The Drift Radar reads deterministic signals from your board — overdue work, deadline churn, stagnation, dependencies, workload.' },
    { n: '03', title: 'Act on the signal', body: 'Open the radar, review evidence at the task level, follow AI-suggested recovery actions, then generate a summary for stakeholders.' },
  ];
  return (
    <section id="how-it-works" className="py-24 md:py-28">
      <div className="container-wide">
        <div className="max-w-2xl">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-3 font-display text-display-md font-bold tracking-tightish">From board to signal to action.</h2>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="relative rounded-2xl border border-midnight/[0.08] bg-white p-7"
            >
              <span className="font-display text-5xl font-bold text-mint-200">{s.n}</span>
              <h3 className="mt-4 font-display text-xl font-bold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slatey">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="py-20">
      <div className="container-wide">
        <div className="relative overflow-hidden rounded-5xl border border-midnight/10 bg-gradient-to-br from-mint-200/60 via-porcelain to-apricot/15 p-12 text-center md:p-20">
          <div className="absolute inset-0 grid-noise opacity-40" aria-hidden />
          <div className="relative">
            <Badge tone="dark" dot>Flowboard AI</Badge>
            <h2 className="mx-auto mt-5 max-w-2xl font-display text-display-md font-bold tracking-tightish text-midnight">
              Stop finding out late. Start staying ahead.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-pretty text-lg text-slatey">
              Set up your workspace in under a minute. The first drift signal is usually waiting.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link to="/app"><Button variant="secondary" size="lg">Start your workspace <ArrowRight className="h-4 w-4" /></Button></Link>
              <Link to="/app"><Button variant="outline" size="lg">Explore the product</Button></Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const cols = [
    { title: 'Product', links: ['Kanban boards', 'Drift Radar', 'AI summaries', 'Roles & permissions', 'Changelog'] },
    { title: 'Company', links: ['About', 'Careers', 'Press', 'Contact'] },
    { title: 'Resources', links: ['Documentation', 'API reference', 'Security', 'Status'] },
    { title: 'Legal', links: ['Privacy', 'Terms', 'DPA', 'SOC 2'] },
  ];
  return (
    <footer className="border-t border-midnight/8 bg-porcelain-50">
      <div className="container-wide py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-slatey">See the work. Understand the risk. Stay ahead.</p>
            <div className="mt-5 flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-sage" />
              <span className="text-2xs font-medium text-slatey-500">All systems operational</span>
            </div>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <p className="text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">{c.title}</p>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l}><a href="#" className="text-sm text-slatey transition-colors hover:text-midnight">{l}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-midnight/8 pt-6 text-2xs text-slatey-400 md:flex-row">
          <span>© 2026 Flowboard AI. Crafted with intention.</span>
          <span className="inline-flex items-center gap-1.5"><Users className="h-3 w-3" /> Made for delivery teams</span>
        </div>
      </div>
    </footer>
  );
}
