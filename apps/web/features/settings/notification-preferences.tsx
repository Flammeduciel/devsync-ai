'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { updateNotificationPreferencesAction } from '../collaboration/actions';

type Pref = { kind: string; inApp: boolean; desktop: boolean; sound: boolean };

const LABELS: Record<string, string> = {
  REQUEST_CREATED: 'New request for me',
  REQUEST_ACCEPTED: 'My request accepted',
  REQUEST_REJECTED: 'My request rejected or cancelled',
  REQUEST_IN_PROGRESS: 'Progress on my request',
  REQUEST_CLARIFICATION: 'Questions and answers',
  DELIVERABLE_READY: 'Deliverable received',
  DEPENDENCY_RESOLVED: 'Dependency resolved',
  BROADCAST: 'Team broadcasts',
  GIT_CONFLICT: 'Git conflict risk',
  KNOWLEDGE_PUBLISHED: 'Knowledge published',
  AGENT_CONNECTED: 'Agent connected',
  AGENT_DISCONNECTED: 'Agent disconnected',
  INVITATION: 'Invitations',
};

export function NotificationPreferences({ teamId, initial }: { teamId: string; initial: Pref[] }) {
  const [prefs, setPrefs] = useState(initial);
  const [pending, startTransition] = useTransition();
  const toggle = (kind: string, field: 'inApp' | 'desktop' | 'sound') =>
    setPrefs((all) => all.map((p) => (p.kind === kind ? { ...p, [field]: !p[field] } : p)));

  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2 font-medium">Event</th>
              <th className="py-2 text-center font-medium">In app</th>
              <th className="py-2 text-center font-medium">Desktop</th>
              <th className="py-2 text-center font-medium">Sound</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {prefs.map((p) => (
              <tr key={p.kind}>
                <td className="py-2">{LABELS[p.kind] ?? p.kind}</td>
                {(['inApp', 'desktop', 'sound'] as const).map((field) => (
                  <td key={field} className="py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${LABELS[p.kind] ?? p.kind}: ${field}`}
                      checked={p[field]}
                      disabled={field === 'sound' && !p.desktop}
                      onChange={() => toggle(p.kind, field)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        className="justify-self-start"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await updateNotificationPreferencesAction(teamId, { preferences: prefs as never });
            if (result.ok) toast.success('Preferences saved');
            else toast.error(result.error);
          })
        }
      >
        Save preferences
      </Button>
      <p className="text-xs text-muted-foreground">Desktop notifications and sounds are played by the DevSync Bridge on your machine, even when Claude Code is closed.</p>
    </div>
  );
}
