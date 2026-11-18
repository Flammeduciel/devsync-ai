import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/server/auth/session';
import { services } from '@/server/container';

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    const [first] = await services().teams.listMine(user.id);
    redirect(first ? (`/t/${first.slug}` as never) : '/onboarding');
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-6">
      <h1 className="text-4xl font-semibold tracking-tight">DevSync AI</h1>
      <p className="text-lg text-muted-foreground">
        A shared workspace where developers and their Claude Code agents exchange context, requests,
        deliverables and Git activity instead of solving the same problem twice.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/sign-up">Create an account</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    </main>
  );
}
