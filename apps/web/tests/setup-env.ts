import { fileURLToPath } from 'node:url';

// Load the monorepo root .env when present (CI provides variables directly).
try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  /* no .env file */
}
