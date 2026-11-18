export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-6">
      <p className="font-mono text-sm text-muted-foreground">Phase 0 — foundations</p>
      <h1 className="text-4xl font-semibold tracking-tight">DevSync AI</h1>
      <p className="text-lg text-muted-foreground">
        A shared workspace where developers and their Claude Code agents exchange context, requests,
        deliverables and Git activity instead of solving the same problem twice.
      </p>
      <p className="text-sm text-muted-foreground">
        Service status: <code className="font-mono">/api/v1/health</code>
      </p>
    </main>
  );
}
