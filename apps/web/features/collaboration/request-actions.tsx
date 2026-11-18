'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { commentAction, requestActionAction } from './actions';
import { ACTION_LABEL } from './labels';

const NEEDS_TEXT = new Set(['clarify', 'answer']);
const DESTRUCTIVE = new Set(['reject', 'cancel']);

export function RequestActions({ requestId, actions, canComment }: { requestId: string; actions: string[]; canComment: boolean }) {
  const [text, setText] = useState('');
  const [pending, startTransition] = useTransition();

  const run = (action: string) =>
    startTransition(async () => {
      if (NEEDS_TEXT.has(action) && !text.trim()) {
        toast.error('Write your question or answer first');
        return;
      }
      if (DESTRUCTIVE.has(action) && !confirm(`${ACTION_LABEL[action]}?`)) return;
      const result = await requestActionAction(requestId, { action: action as 'accept', ...(text.trim() ? { comment: text.trim() } : {}) });
      if (result.ok) {
        setText('');
        toast.success(`${ACTION_LABEL[action]}: done`);
      } else toast.error(result.error);
    });

  const comment = () =>
    startTransition(async () => {
      const result = await commentAction(requestId, text.trim());
      if (result.ok) setText('');
      else toast.error(result.error);
    });

  if (!canComment && actions.length === 0) return null;
  return (
    <div className="grid gap-3">
      <Textarea aria-label="Message" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Comment, question, answer or reason…" />
      <div className="flex flex-wrap gap-2">
        {canComment ? (
          <Button variant="outline" disabled={pending || !text.trim()} onClick={comment}>
            Comment
          </Button>
        ) : null}
        {actions.map((action) => (
          <Button key={action} variant={DESTRUCTIVE.has(action) ? 'ghost' : 'default'} disabled={pending} onClick={() => run(action)}>
            {ACTION_LABEL[action] ?? action}
          </Button>
        ))}
      </div>
    </div>
  );
}
