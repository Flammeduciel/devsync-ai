import { Card } from '@/components/ui/card';
import { PageHeader } from '@/features/shell/page-header';
import { actionLabel, timeAgo } from '@/lib/format';
import { requireUser } from '@/server/auth/session';
import { services } from '@/server/container';

export default async function AdminAuditPage() {
  const user = await requireUser();
  const rows = await services().platform.auditLog(user.id);
  return (
    <>
      <PageHeader title="Audit log" description="Every platform admin action." />
      <Card className="py-0">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No admin action yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 p-3">
                <span>
                  <span className="font-medium">{actionLabel(r.action)}</span> · {r.targetType}{' '}
                  {r.targetId ? <code className="text-xs">{r.targetId.slice(0, 8)}</code> : null}
                  <span className="block text-xs text-muted-foreground">
                    {JSON.stringify(r.metadata)}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {r.admin} · {timeAgo(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
