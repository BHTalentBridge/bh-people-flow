import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-7.5 w-7.5 text-[11px]',
  md: 'h-9 w-9 text-[13px]',
  lg: 'h-11 w-11 text-[15px]',
};

export function Avatar({
  name,
  color,
  size = 'sm',
  className,
}: {
  name?: string | null;
  color?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none',
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: color ?? '#64748b' }}
      title={name ?? undefined}
    >
      {initials(name)}
    </span>
  );
}

/** Overlapping avatars for a roster — collapses past `max`. */
export function AvatarStack({
  people,
  max = 4,
  size = 'sm',
}: {
  people: { name: string; avatarColor?: string | null }[];
  max?: number;
  size?: keyof typeof SIZES;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <Avatar
          key={`${p.name}-${i}`}
          name={p.name}
          color={p.avatarColor}
          size={size}
          className="-ml-1.5 ring-2 ring-[color:var(--surface-card)] first:ml-0"
        />
      ))}
      {rest > 0 && (
        <span
          className={cn(
            SIZES[size],
            'text-secondary -ml-1.5 inline-flex items-center justify-center rounded-full bg-[color:var(--surface-sunken)] font-semibold ring-2 ring-[color:var(--surface-card)]',
          )}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}
