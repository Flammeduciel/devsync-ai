'use client';

import { useRouter } from 'next/navigation';
import { useRealtime } from '../realtime/use-realtime';

/** One socket per page: refreshes server data when a notification or request event arrives. */
export function RealtimeRefresh() {
  const router = useRouter();
  useRealtime((event) => {
    if (event.type === 'notification.created' || event.type.startsWith('collaboration.'))
      router.refresh();
  });
  return null;
}

export function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      aria-label={`${count} unread`}
      className="ml-auto rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
