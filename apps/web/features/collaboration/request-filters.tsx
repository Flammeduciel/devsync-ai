'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { NativeSelect } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { STATUS_LABEL } from './labels';

const SCOPES = [
  { value: 'all', label: 'All' },
  { value: 'assigned', label: 'Assigned to me' },
  { value: 'created', label: 'Created by me' },
] as const;

export function RequestFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}` as never);
  };
  const scope = params.get('scope') ?? 'all';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="tablist" aria-label="Scope" className="inline-flex rounded-md border p-0.5">
        {SCOPES.map((s) => (
          <button
            key={s.value}
            role="tab"
            aria-selected={scope === s.value}
            onClick={() => set('scope', s.value === 'all' ? '' : s.value)}
            className={cn('rounded px-3 py-1 text-sm', scope === s.value ? 'bg-accent font-medium' : 'text-muted-foreground hover:text-foreground')}
          >
            {s.label}
          </button>
        ))}
      </div>
      <NativeSelect aria-label="Status" value={params.get('status') ?? ''} onChange={(e) => set('status', e.target.value)}>
        <option value="">Any status</option>
        {Object.entries(STATUS_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
