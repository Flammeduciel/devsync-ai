'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addRepositoryAction } from './actions';

export function AddRepositoryForm({ projectId }: { projectId: string }) {
  const [remoteUrl, setRemoteUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-start"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await addRepositoryAction(projectId, { remoteUrl });
          if (!result.ok) {
            setError(result.fieldErrors?.remoteUrl ?? result.error);
            return;
          }
          setError(null);
          setRemoteUrl('');
          toast.success('Repository linked');
        });
      }}
    >
      <div className="flex-1">
        <Input
          aria-label="Git remote URL"
          placeholder="git@github.com:acme/payments.git"
          value={remoteUrl}
          aria-invalid={!!error}
          onChange={(event) => setRemoteUrl(event.target.value)}
        />
        {error ? (
          <p role="alert" className="mt-1 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" variant="outline" disabled={pending || !remoteUrl.trim()}>
        Link repository
      </Button>
    </form>
  );
}
