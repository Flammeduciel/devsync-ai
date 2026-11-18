import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AcceptInvitationButton } from '@/features/teams/accept-invitation-button';
import { roleLabel } from '@/lib/format';
import { getCurrentUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { orNotFound } from '@/server/http/page';

export const metadata: Metadata = { title: 'Invitation', robots: { index: false } };

export default async function InvitationPage({ params }: PageProps<'/invitations/[token]'>) {
  const { token } = await params;
  const invitation = await orNotFound(services().invitations.preview(token));
  const user = await getCurrentUser();
  const here = `/invitations/${encodeURIComponent(token)}`;

  let body;
  if (invitation.state !== 'pending') {
    body = <p className="text-sm">This invitation is {invitation.state}. Ask a team admin for a new one.</p>;
  } else if (!user) {
    body = (
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href={{ pathname: '/sign-up', query: { next: here, email: invitation.email } }}>Create an account</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={{ pathname: '/sign-in', query: { next: here } }}>Sign in</Link>
        </Button>
      </div>
    );
  } else if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    body = (
      <p className="text-sm">
        This invitation was sent to <strong>{invitation.email}</strong>, but you are signed in as {user.email}.
      </p>
    );
  } else {
    body = <AcceptInvitationButton token={token} />;
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Join {invitation.teamName}</CardTitle>
          <CardDescription>
            You are invited as {roleLabel(invitation.role)} ({invitation.email}).
          </CardDescription>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </main>
  );
}
