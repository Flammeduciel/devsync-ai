import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { getCurrentUser, requireUser } from '@/server/auth/session';
import { services } from '@/server/container';

/** The title must not reveal the console to non-admins (they get a 404 page). */
export async function generateMetadata(): Promise<Metadata> {
  const user = await getCurrentUser();
  const admin = user ? await services().platform.isAdmin(user.id) : false;
  return admin
    ? { title: 'Platform admin', robots: { index: false } }
    : { title: 'Not found', robots: { index: false } };
}

/** Platform owner console. Hidden (404) for everyone who is not a verified platform admin. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  if (!(await services().platform.isAdmin(user.id))) notFound();
  return (
    <div className="min-h-dvh">
      <header className="border-b bg-muted/30">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3 text-sm">
          <span className="font-semibold">DevSync AI · Platform admin</span>
          <nav aria-label="Admin" className="flex gap-3 text-muted-foreground">
            <Link href="/admin" className="hover:text-foreground">
              Overview
            </Link>
            <Link href="/admin/teams" className="hover:text-foreground">
              Teams
            </Link>
            <Link href="/admin/users" className="hover:text-foreground">
              Users
            </Link>
            <Link href="/admin/audit" className="hover:text-foreground">
              Audit log
            </Link>
          </nav>
          <Link href="/" className="ml-auto text-muted-foreground hover:text-foreground">
            Back to app
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">{children}</main>
    </div>
  );
}
