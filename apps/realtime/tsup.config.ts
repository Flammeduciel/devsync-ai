import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node24',
  clean: true,
  // Workspace packages ship TypeScript sources: bundle them; keep npm deps external.
  noExternal: [/^@devsync\//],
  // Third-party deps reached through workspace packages stay external (installed at runtime).
  external: ['pino'],
});
