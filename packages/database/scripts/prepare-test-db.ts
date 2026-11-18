import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Applies migrations to the integration-test database (DATABASE_URL_TEST).
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error('DATABASE_URL_TEST is not set');

execFileSync('prisma', ['migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
});
