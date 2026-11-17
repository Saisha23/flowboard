import type { HTMLAttributes } from 'react';
import { cx } from '@/lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  ivory?: boolean;
  hover?: boolean;
}

export function Card({ className, ivory, hover, ...props }: CardProps) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-midnight/[0.07]',
        ivory ? 'bg-ivory' : 'bg-white',
        'shadow-soft',
        hover && 'transition-all duration-300 hover:shadow-card hover:-translate-y-0.5',
        className,
      )}
      {...props}
    />
  );
}
