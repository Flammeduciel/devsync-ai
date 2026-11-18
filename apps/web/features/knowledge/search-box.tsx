'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';

export function KnowledgeSearchBox() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (next: URLSearchParams) => router.replace(`${pathname}?${next.toString()}` as never);
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        const next = new URLSearchParams(params);
        const q = String(new FormData(e.currentTarget).get('q') ?? '').trim();
        if (q) next.set('q', q);
        else next.delete('q');
        go(next);
      }}
    >
      <Input name="q" aria-label="Search knowledge" defaultValue={params.get('q') ?? ''} placeholder="Search by words or meaning, e.g. « format des montants »" className="flex-1" />
      <NativeSelect
        aria-label="Filter"
        value={params.get('filter') ?? ''}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          if (e.target.value) next.set('filter', e.target.value);
          else next.delete('filter');
          go(next);
        }}
      >
        <option value="">All</option>
        <option value="mine">Mine</option>
        <option value="private">My private notes</option>
      </NativeSelect>
    </form>
  );
}
