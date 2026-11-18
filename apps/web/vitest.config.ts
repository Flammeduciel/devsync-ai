import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup-env.ts'],
    // `server-only` throws outside React Server Components; services don't import it, but some infra does.
    server: { deps: { inline: [/@devsync\//] } },
  },
});
