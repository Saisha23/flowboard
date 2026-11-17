import { cx } from '@/lib/utils';

interface LogoProps {
  variant?: 'light' | 'dark';
  showWordmark?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: { mark: 'h-7 w-7', text: 'text-base' },
  md: { mark: 'h-8 w-8', text: 'text-lg' },
  lg: { mark: 'h-9 w-9', text: 'text-xl' },
};

export function Logo({ variant = 'dark', showWordmark = true, className, size = 'md' }: LogoProps) {
  const s = sizes[size];
  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      <span
        className={cx(
          'relative inline-flex items-center justify-center rounded-xl',
          s.mark,
          variant === 'dark' ? 'bg-midnight' : 'bg-white',
        )}
      >
        <svg viewBox="0 0 32 32" className="h-[60%] w-[60%]" fill="none">
          <path d="M7 11h7M7 16h11M7 21h5" stroke={variant === 'dark' ? '#B8E4D0' : '#111820'} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="23" cy="11" r="2.6" fill={variant === 'dark' ? '#D69A78' : '#D69A78'} />
        </svg>
      </span>
      {showWordmark && (
        <span
          className={cx(
            'font-display font-bold tracking-tightish',
            s.text,
            variant === 'dark' ? 'text-midnight' : 'text-porcelain',
          )}
        >
          Flowboard<span className="text-mint-300"> AI</span>
        </span>
      )}
    </div>
  );
}
