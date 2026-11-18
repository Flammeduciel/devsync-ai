import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { MarkReadButton } from '@/features/notifications/mark-read-button';
import { PageHeader } from '@/features/shell/page-header';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { services } from '@/server/container';
import { loadTeamPage } from '@/server/http/page';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage({ params }: PageProps<'/t/[teamSlug]/notifications'>) {
  const { teamSlug } = await params;
  const { user, team } = await loadTeamPage(teamSlug);
  const { items, unread } = await services().notifications.list(user.id, team.id, { limit: 100 });

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : 'All caught up.'}
        actions={unread ? <MarkReadButton teamId={team.id} ids="all" label="Mark all as read" /> : null}
      />
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No notification yet.</p>
      ) : (
        <Card className="py-0">
          <ul className="divide-y">
            {items.map((n) => (
              <li key={n.id} className={cn('flex flex-wrap items-start justify-between gap-3 px-4 py-3', !n.readAt && 'bg-accent/40')}>
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {n.link ? (
                      <Link href={n.link as never} className="hover:underline">
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                  </p>
                  {n.body ? <p className="text-muted-foreground">{n.body}</p> : null}
                  <p className="text-xs text-muted-foreground">{timeAgo(n.createdAt)}</p>
                </div>
                {!n.readAt ? <MarkReadButton teamId={team.id} ids={[n.id]} label="Mark read" /> : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
