import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/features/auth/auth-card';
import { SignUpForm } from '@/features/auth/sign-up-form';
import { safeRedirect } from '@/lib/safe-redirect';
import { getCurrentUser } from '@/server/auth/session';

export const metadata: Metadata = { title: 'Create an account' };

export default async function SignUpPage({ searchParams }: PageProps<'/sign-up'>) {
  const params = await searchParams;
  const next = safeRedirect(params.next as string | undefined);
  if (await getCurrentUser()) redirect(next as never);
  return (
    <AuthCard
      title="Create your account"
      description="Connect your team and its AI agents."
      footer={
        <>
          Already have an account?{' '}
          <Link href={{ pathname: '/sign-in', query: { next } }} className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm next={next} email={params.email as string | undefined} />
    </AuthCard>
  );
}
