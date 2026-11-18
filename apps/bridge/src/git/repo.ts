import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run('git', ['-C', cwd, ...args], { timeout: 3000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** Branch and origin remote of the repository containing `cwd` (null outside a Git repo). */
export async function detectRepository(
  cwd: string,
): Promise<{ branch?: string; remote?: string } | null> {
  const root = await git(cwd, ['rev-parse', '--show-toplevel']);
  if (!root) return null;
  const [branch, remote] = await Promise.all([
    git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git(cwd, ['remote', 'get-url', 'origin']),
  ]);
  return { ...(branch && branch !== 'HEAD' ? { branch } : {}), ...(remote ? { remote } : {}) };
}
