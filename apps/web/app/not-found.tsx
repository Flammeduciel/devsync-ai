import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Not found</h1>
        <p className="text-sm text-muted-foreground">
          This page does not exist or you do not have access to it.
        </p>
        <Link href="/" className="text-sm underline underline-offset-4">
          Go home
        </Link>
      </div>
    </main>
  );
}
