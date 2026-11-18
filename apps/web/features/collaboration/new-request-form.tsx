'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createRequestAction } from './actions';

export interface AssigneeOption {
  value: string; // "user:<id>" or "agent:<id>"
  label: string;
}

const TYPES = [
  ['WORK', 'Work — build something'],
  ['KNOWLEDGE', 'Knowledge — answer a question'],
  ['DEPENDENCY', 'Dependency — I am blocked'],
  ['REVIEW', 'Review'],
  ['COLLABORATION', 'Collaboration'],
] as const;

export function NewRequestForm({
  teamSlug,
  projects,
  assignees,
}: {
  teamSlug: string;
  projects: { id: string; name: string }[];
  assignees: AssigneeOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (projects.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        You need write access to a project to create requests.
      </p>
    );

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const [kind, id] = String(form.get('assignee')).split(':');
        startTransition(async () => {
          const result = await createRequestAction({
            projectId: String(form.get('projectId')),
            type: String(form.get('type')) as 'WORK',
            title: String(form.get('title')),
            description: String(form.get('description')),
            priority: String(form.get('priority')) as 'NORMAL',
            ...(kind === 'agent' ? { assigneeAgentId: id } : { assigneeUserId: id }),
          });
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {});
            toast.error(result.error);
            return;
          }
          toast.success('Request sent');
          router.push(`/t/${teamSlug}/requests/${result.data.id}` as never);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="projectId" label="Project">
          <NativeSelect id="projectId" name="projectId">
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="assignee" label="Ask" error={errors.assigneeUserId}>
          <NativeSelect id="assignee" name="assignee">
            {assignees.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="type" label="Type">
          <NativeSelect id="type" name="type">
            {TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="priority" label="Priority">
          <NativeSelect id="priority" name="priority" defaultValue="NORMAL">
            {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => (
              <option key={p} value={p}>
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <FormField id="title" label="Title" error={errors.title}>
        <Input
          id="title"
          name="title"
          required
          minLength={3}
          maxLength={200}
          placeholder="Payment API contract for the checkout form"
        />
      </FormField>
      <FormField id="description" label="What do you need?" error={errors.description}>
        <Textarea id="description" name="description" required rows={5} maxLength={5000} />
      </FormField>
      <Button type="submit" className="justify-self-start" disabled={pending}>
        {pending ? 'Sending…' : 'Send request'}
      </Button>
    </form>
  );
}
