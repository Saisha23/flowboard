import type { HTMLAttributes } from 'react';
import { cx } from '@/lib/utils';

type Tone = 'neutral' | 'mint' | 'apricot' | 'coral' | 'amber' | 'sage' | 'slatey' | 'dark';

const tones: Record<Tone, string> = {
  neutral: 'bg-midnight/5 text-midnight/70',
  mint: 'bg-mint-50 text-mint-500',
  apricot: 'bg-apricot-50 text-apricot-400',
  coral: 'bg-coral/10 text-coral',
  amber: 'bg-amber/15 text-amber',
  sage: 'bg-sage/15 text-sage',
  slatey: 'bg-slatey-100 text-slatey-600',
  dark: 'bg-midnight text-porcelain',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
}

export function Badge({ className, tone = 'neutral', dot, children, ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-semibold tracking-wide2',
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}
