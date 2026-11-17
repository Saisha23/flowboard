import { motion } from 'framer-motion';
import { cx } from '@/lib/utils';

interface ProgressRingProps {
  value: number; // 0-100
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  sublabel?: string;
}

export function ProgressRing({ value, size = 88, stroke = 8, color = '#77B99B', trackColor = 'rgba(17,24,32,0.08)', label, sublabel }: ProgressRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (value / 100) * c }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label && <span className="font-display text-lg font-bold text-midnight">{label}</span>}
        {sublabel && <span className="text-2xs text-slatey">{sublabel}</span>}
      </div>
    </div>
  );
}

interface ProgressBarProps {
  value: number; // 0-100
  className?: string;
  color?: string;
  trackClassName?: string;
}

export function ProgressBar({ value, className, color, trackClassName = 'bg-midnight/8' }: ProgressBarProps) {
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full', trackClassName, className)}>
      <motion.div
        className={cx('h-full rounded-full', color ?? 'bg-mint-300')}
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
      />
    </div>
  );
}
