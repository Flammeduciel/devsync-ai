import 'server-only';
import { getDatabase } from '@devsync/database';
import { newId } from '@devsync/shared';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { serverEnv } from '../env';
import { mailer } from '../infrastructure/mailer';
import { redis } from '../infrastructure/redis';
import { redisSecondaryStorage } from './redis-storage';

export const AUTH_BASE_PATH = '/api/v1/auth';

function createAuth() {
  const env = serverEnv();
  return betterAuth({
    appName: 'DevSync AI',
    baseURL: env.APP_URL,
    basePath: AUTH_BASE_PATH,
    secret: env.AUTH_SECRET,
    database: prismaAdapter(getDatabase(), { provider: 'postgresql' }),
    // Redis backs rate limiting; sessions stay in PostgreSQL (source of truth, revocable).
    secondaryStorage: redisSecondaryStorage(redis),
    session: {
      storeSessionInDatabase: true,
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: true,
      storage: 'secondary-storage',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 300, max: 5 },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: true,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        await mailer().send({
          to: user.email,
          subject: 'Reset your DevSync AI password',
          text: [
            `Hi ${user.name},`,
            '',
            `Reset your password: ${url}`,
            '',
            'This link expires in one hour. If you did not ask for it, ignore this email.',
          ].join('\n'),
        });
      },
    },
    advanced: {
      database: { generateId: () => newId() },
      useSecureCookies: env.NODE_ENV === 'production',
      cookiePrefix: 'devsync',
    },
    plugins: [nextCookies()],
  });
}

const globalForAuth = globalThis as unknown as { __devsyncAuth?: ReturnType<typeof createAuth> };

export function auth(): ReturnType<typeof createAuth> {
  globalForAuth.__devsyncAuth ??= createAuth();
  return globalForAuth.__devsyncAuth;
}
