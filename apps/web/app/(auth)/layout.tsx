import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <Link href="/" className="block text-center text-lg font-semibold tracking-tight">
          DevSync AI
        </Link>
        {children}
      </div>
    </main>
  );
}
