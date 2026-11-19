'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { updateMySpecialtiesAction } from '../teams/actions';

const parse = (value: string) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function SpecialtiesForm({ teamId, initial }: { teamId: string; initial: string[] }) {
  const [saved, setSaved] = useState(initial.join(', '));
  const [value, setValue] = useState(saved);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid max-w-md gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await updateMySpecialtiesAction(teamId, { specialties: parse(value) });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          const normalized = result.data.specialties.join(', ');
          setSaved(normalized);
          setValue(normalized);
          toast.success('Expertise saved');
        });
      }}
    >
      <FormField
        id="specialties"
        label="Topics you know"
        hint="Comma-separated, e.g. payments, stripe, frontend, CI. Use the words your teammates would use."
      >
        <Input
          id="specialties"
          value={value}
          placeholder="payments, stripe, frontend"
          onChange={(event) => setValue(event.target.value)}
        />
      </FormField>
      <Button
        type="submit"
        className="justify-self-start"
        disabled={pending || value.trim() === saved.trim()}
      >
        Save
      </Button>
    </form>
  );
}
