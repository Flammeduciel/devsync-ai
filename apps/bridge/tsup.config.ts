import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node24',
  clean: true,
  // Workspace packages are bundled; npm dependencies stay external.
  noExternal: [/^@devsync\//],
  external: ['pino', 'socket.io-client', 'zod'],
});
