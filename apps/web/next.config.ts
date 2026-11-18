import type { NextConfig } from 'next';

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
