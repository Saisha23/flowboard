import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const sizeClasses: Record<Size, string> = {
  sm: 'text-2xs px-3 py-1.5 rounded-lg gap-1.5',
  md: 'text-sm px-4 py-2.5 rounded-xl gap-2',
  lg: 'text-sm px-5 py-3 rounded-xl gap-2',
};

const variantClasses: Record<Variant, string> = {
  primary: 'bg-mint-200 text-midnight hover:bg-mint-300 hover:shadow-lift',
  secondary: 'bg-midnight text-porcelain hover:bg-midnight-600',
  ghost: 'text-midnight hover:bg-midnight/5',
  outline: 'border border-midnight/15 text-midnight hover:border-midnight/30 hover:bg-white',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => (
    <button
      ref={ref}
      className={cx(
        'inline-flex items-center justify-center font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
