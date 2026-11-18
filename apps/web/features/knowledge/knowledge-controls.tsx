'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { setValidityAction, setVisibilityAction } from './actions';

export function KnowledgeControls({ knowledgeId, visibility, validity, isAuthor, canManage }: { knowledgeId: string; visibility: string; validity: string; isAuthor: boolean; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) toast.success(done);
      else toast.error(r.error ?? 'Failed');
    });
  return (
    <div className="flex flex-wrap gap-2">
      {isAuthor ? (
        visibility === 'PRIVATE' ? (
          <Button disabled={pending} onClick={() => run(() => setVisibilityAction(knowledgeId, 'PROJECT'), 'Shared with the project')}>
            Share with the project
          </Button>
        ) : (
          <Button variant="outline" disabled={pending} onClick={() => run(() => setVisibilityAction(knowledgeId, 'PRIVATE'), 'Now private')}>
            Make private
          </Button>
        )
      ) : null}
      {isAuthor || canManage ? (
        validity === 'VALID' || validity === 'DRAFT' ? (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              const reason = prompt('Why is it outdated? (readers are told)') ?? undefined;
              run(() => setValidityAction(knowledgeId, 'OUTDATED', reason || undefined), 'Marked outdated');
            }}
          >
            Mark outdated
          </Button>
        ) : (
          <Button variant="ghost" disabled={pending} onClick={() => run(() => setValidityAction(knowledgeId, 'VALID'), 'Marked valid')}>
            Mark valid again
          </Button>
        )
      ) : null}
    </div>
  );
}
