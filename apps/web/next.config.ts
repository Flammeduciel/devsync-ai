import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// The monorepo keeps a single .env at the root. Loaded natively (existing variables win) so the
// server workers spawned by Next inherit it; @next/env would cache the app-folder lookup instead.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript sources.
  transpilePackages: [
    '@devsync/config',
    '@devsync/event-schemas',
    '@devsync/protocol',
    '@devsync/shared',
    '@devsync/validation',
  ],
  serverExternalPackages: ['@devsync/database', 'pino', 'ioredis'],
  output: 'standalone',
  poweredByHeader: false,
  typedRoutes: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
