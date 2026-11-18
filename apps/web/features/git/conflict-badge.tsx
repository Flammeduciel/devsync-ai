import { cn } from '@/lib/utils';

const STYLE = {
  FILE_OVERLAP: ['Same file', 'bg-muted text-foreground'],
  LINE_OVERLAP: ['Same lines', 'bg-warning/25 text-foreground'],
  POTENTIAL_CONFLICT: ['Merge conflict likely', 'bg-destructive/15 text-destructive'],
  CONFIRMED_CONFLICT: ['Merge conflict', 'bg-destructive text-white'],
} as const;

export function ConflictBadge({ kind }: { kind: keyof typeof STYLE }) {
  const [label, style] = STYLE[kind];
  return <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', style)}>{label}</span>;
}
