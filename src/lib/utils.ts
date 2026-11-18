import type { LabelColor, Priority, RiskLevel, Role } from '@/types';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatDate(iso: string | null, opts?: { relative?: boolean }): string {
  if (!iso) return 'No due date';
  const d = new Date(iso);
  if (opts?.relative) return relativeDay(d);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function relativeDay(d: Date): string {
  const now = new Date('2026-11-17T09:00:00Z');
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diff = Math.round((startOf(d).getTime() - startOf(now).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0) return `${Math.abs(diff)} days overdue`;
  if (diff < 7) return `In ${diff} days`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < new Date('2026-11-17T09:00:00Z').getTime();
}

export function timeAgo(iso: string): string {
  const now = new Date('2026-11-17T09:00:00Z').getTime();
  const then = new Date(iso).getTime();
  const diff = (now - then) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ---- Token maps (kept here so Tailwind classes stay static & analyzable) ----

export const labelColorClasses: Record<LabelColor, { dot: string; pill: string }> = {
  mint: { dot: 'bg-mint-300', pill: 'bg-mint-50 text-mint-500' },
  apricot: { dot: 'bg-apricot-200', pill: 'bg-apricot-50 text-apricot-400' },
  sand: { dot: 'bg-sand-300', pill: 'bg-sand-50 text-apricot-400' },
  coral: { dot: 'bg-coral', pill: 'bg-coral/10 text-coral' },
  amber: { dot: 'bg-amber', pill: 'bg-amber/15 text-amber' },
  slatey: { dot: 'bg-slatey-400', pill: 'bg-slatey-100 text-slatey-500' },
  sage: { dot: 'bg-sage', pill: 'bg-sage/15 text-sage' },
};

export const priorityMeta: Record<Priority, { label: string; dot: string; pill: string }> = {
  URGENT: { label: 'Urgent', dot: 'bg-coral', pill: 'bg-coral/12 text-coral' },
  HIGH: { label: 'High', dot: 'bg-amber', pill: 'bg-amber/15 text-amber' },
  MEDIUM: { label: 'Medium', dot: 'bg-slatey-400', pill: 'bg-slatey-100 text-slatey-500' },
  LOW: { label: 'Low', dot: 'bg-sage', pill: 'bg-sage/15 text-sage' },
};

export const riskMeta: Record<RiskLevel, { label: string; color: string; bg: string; ring: string; text: string }> = {
  HEALTHY: { label: 'Healthy', color: '#77B99B', bg: 'bg-sage/12', ring: 'ring-sage/30', text: 'text-sage' },
  WATCH: { label: 'Watch', color: '#E2B65C', bg: 'bg-amber/12', ring: 'ring-amber/30', text: 'text-amber' },
  AT_RISK: { label: 'At Risk', color: '#D69A78', bg: 'bg-apricot/15', ring: 'ring-apricot/40', text: 'text-apricot-400' },
  CRITICAL: { label: 'Critical', color: '#D97770', bg: 'bg-coral/12', ring: 'ring-coral/40', text: 'text-coral' },
};

export const roleMeta: Record<Role, { label: string; pill: string; description: string }> = {
  OWNER: { label: 'Owner', pill: 'bg-midnight text-porcelain', description: 'Full board and membership control' },
  ADMIN: { label: 'Admin', pill: 'bg-apricot-50 text-apricot-500', description: 'Manage boards and team settings' },
  MEMBER: { label: 'Member', pill: 'bg-mint-200 text-midnight', description: 'Create, edit, assign and move tasks' },
  VIEWER: { label: 'Viewer', pill: 'bg-slatey-100 text-slatey-600', description: 'Read-only access' },
};

export const priorityOrder: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
