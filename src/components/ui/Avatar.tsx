import { cx } from '@/lib/utils';

interface AvatarProps {
  initials: string;
  color?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  ring?: boolean;
  title?: string;
}

const sizes = {
  xs: 'h-5 w-5 text-[9px]',
  sm: 'h-6 w-6 text-2xs',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
};

export function Avatar({ initials, color = '#777C8E', size = 'sm', className, ring, title }: AvatarProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center justify-center rounded-full font-semibold text-white',
        sizes[size],
        ring && 'ring-2 ring-white',
        className,
      )}
      style={{ backgroundColor: color }}
      title={title}
    >
      {initials}
    </span>
  );
}

interface AvatarStackProps {
  people: { id: string; name: string; initials: string; color: string }[];
  size?: 'xs' | 'sm' | 'md';
  max?: number;
  className?: string;
}

export function AvatarStack({ people, size = 'sm', max = 3, className }: AvatarStackProps) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className={cx('flex items-center', className)}>
      <div className="flex -space-x-1.5">
        {shown.map((p) => (
          <Avatar key={p.id} initials={p.initials} color={p.color} size={size} ring title={p.name} />
        ))}
        {extra > 0 && (
          <span
            className={cx(
              'inline-flex items-center justify-center rounded-full bg-midnight-200 font-semibold text-midnight ring-2 ring-white',
              sizes[size],
            )}
          >
            +{extra}
          </span>
        )}
      </div>
    </div>
  );
}
