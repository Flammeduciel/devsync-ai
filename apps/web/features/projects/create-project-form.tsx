'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createProjectSchema, type CreateProjectInput } from '@devsync/validation';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createProjectAction } from './actions';

export function CreateProjectForm({ teamId, teamSlug }: { teamId: string; teamSlug: string }) {
  const router = useRouter();
  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { name: '', description: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await createProjectAction(teamId, {
      ...values,
      description: values.description || undefined,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.push(`/t/${teamSlug}/projects/${result.data.id}` as never);
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormField id="project-name" label="Name" error={errors.name?.message}>
        <Input
          id="project-name"
          placeholder="Checkout"
          aria-invalid={!!errors.name}
          {...form.register('name')}
        />
      </FormField>
      <FormField id="project-description" label="Description" error={errors.description?.message}>
        <Textarea
          id="project-description"
          rows={3}
          placeholder="What this project is about"
          {...form.register('description')}
        />
      </FormField>
      <Button type="submit" className="justify-self-start" disabled={isSubmitting}>
        {isSubmitting ? 'Creating…' : 'Create project'}
      </Button>
    </form>
  );
}
