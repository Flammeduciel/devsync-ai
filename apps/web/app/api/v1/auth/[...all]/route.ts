import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/server/auth/auth';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => toNextJsHandler(auth()).GET(request);
export const POST = (request: Request) => toNextJsHandler(auth()).POST(request);
