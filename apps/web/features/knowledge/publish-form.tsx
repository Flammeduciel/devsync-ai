'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { publishKnowledgeAction } from './actions';

const KINDS = [
  'DOCUMENTATION',
  'DECISION',
  'API_CONTRACT',
  'SOLUTION',
  'ANALYSIS',
  'INSTRUCTION',
  'BRAINSTORM',
];

export function PublishKnowledgeForm({
  teamSlug,
  projects,
}: {
  teamSlug: string;
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (projects.length === 0)
    return <p className="text-sm text-muted-foreground">You need write access to a project.</p>;
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        startTransition(async () => {
          const r = await publishKnowledgeAction({
            projectId: String(f.get('projectId')),
            kind: String(f.get('kind')) as 'DECISION',
            title: String(f.get('title')),
            summary: String(f.get('summary')) || undefined,
            content: String(f.get('content')),
            tags: String(f.get('tags'))
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
            visibility: f.get('private') ? 'PRIVATE' : 'PROJECT',
          });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            toast.error(r.error);
            return;
          }
          router.push(`/t/${teamSlug}/knowledge/${r.data.knowledgeId}` as never);
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <FormField id="k-project" label="Project">
          <NativeSelect id="k-project" name="projectId">
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="k-kind" label="Kind">
          <NativeSelect id="k-kind" name="kind">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k.charAt(0) + k.slice(1).toLowerCase().replace('_', ' ')}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <FormField id="k-title" label="Title" error={errors.title}>
        <Input id="k-title" name="title" required minLength={3} maxLength={200} />
      </FormField>
      <FormField id="k-summary" label="Summary">
        <Input
          id="k-summary"
          name="summary"
          maxLength={1000}
          placeholder="One sentence shown in search results"
        />
      </FormField>
      <FormField id="k-content" label="Content (Markdown)" error={errors.content}>
        <Textarea id="k-content" name="content" required rows={8} />
      </FormField>
      <FormField id="k-tags" label="Tags" hint="Comma separated, e.g. payments, api">
        <Input id="k-tags" name="tags" />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="private" /> Keep private (only me)
      </label>
      <Button type="submit" className="justify-self-start" disabled={pending}>
        Publish
      </Button>
    </form>
  );
}
