import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/features/auth/auth-card';
import { SignInForm } from '@/features/auth/sign-in-form';
import { safeRedirect } from '@/lib/safe-redirect';
import { getCurrentUser } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  const next = safeRedirect((await searchParams).next as string | undefined);
  if (await getCurrentUser()) redirect(next as never);
  return (
    <AuthCard
      title="Sign in"
      description="Welcome back to your team."
      footer={
        <>
          No account yet?{' '}
          <Link
            href={{ pathname: '/sign-up', query: { next } }}
            className="text-foreground underline underline-offset-4"
          >
            Create one
          </Link>
        </>
      }
    >
      <SignInForm next={next} />
    </AuthCard>
  );
}
