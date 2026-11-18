import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/features/auth/auth-card';
import { ForgotPasswordForm } from '@/features/auth/forgot-password-form';

export const metadata: Metadata = { title: 'Reset password' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="We will email you a link to choose a new password."
      footer={<Link href="/sign-in" className="underline underline-offset-4">Back to sign in</Link>}
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
