import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/features/auth/auth-card';
import { ResetPasswordForm } from '@/features/auth/reset-password-form';

export const metadata: Metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  const { token, error } = await searchParams;
  if (typeof token !== 'string' || error) {
    return (
      <AuthCard
        title="Link expired"
        description="This password reset link is invalid or has expired."
      >
        <Link href="/forgot-password" className="text-sm underline underline-offset-4">
          Request a new link
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password">
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
