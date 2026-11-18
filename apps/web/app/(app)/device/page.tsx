import { isAppError } from '@devsync/shared';
import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ApproveDevice } from '@/features/devices/approve-device';
import { timeAgo } from '@/lib/format';
import { requireUser } from '@/server/auth/session';
import { hasTeamPermission } from '@/server/domain/permissions';
import { services } from '@/server/container';

export const metadata: Metadata = { title: 'Connect a machine' };

async function describe(code: string) {
  try {
    return await services().devices.describe(code);
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  }
}

export default async function DevicePage({ searchParams }: PageProps<'/device'>) {
  const user = await requireUser();
  const code = typeof (await searchParams).code === 'string' ? ((await searchParams).code as string) : '';
  const request = code ? await describe(code) : null;
  const teams = (await services().teams.listMine(user.id)).filter((t) => hasTeamPermission(t.role, 'project:create'));

  return (
    <main className="grid min-h-dvh place-items-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Connect a machine</CardTitle>
          <CardDescription>Approve the DevSync Bridge started with <code className="font-mono">devsync login</code>.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {request ? (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border p-3 text-sm">
                <dt className="text-muted-foreground">Code</dt>
                <dd className="font-mono font-semibold">{request.userCode}</dd>
                <dt className="text-muted-foreground">Machine</dt>
                <dd>{request.machineName}</dd>
                {request.os ? (
                  <>
                    <dt className="text-muted-foreground">System</dt>
                    <dd>{request.os}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Requested</dt>
                <dd>{timeAgo(request.createdAt)}</dd>
              </dl>
              <p className="text-xs text-muted-foreground">
                Only approve if this code is shown in your own terminal. The machine will act as {user.email} in the chosen team.
              </p>
              <ApproveDevice userCode={request.userCode} teams={teams.map(({ id, name }) => ({ id, name }))} />
            </>
          ) : (
            <form className="grid gap-3" action="/device">
              {code ? <p role="alert" className="text-sm text-destructive">This code is invalid or has expired.</p> : null}
              <Input name="code" aria-label="Code" placeholder="ABCD-EFGH" autoComplete="off" className="font-mono uppercase" required />
              <Button type="submit">Continue</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
