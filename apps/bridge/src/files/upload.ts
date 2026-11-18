import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, extname, resolve, sep } from 'node:path';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tgz': 'application/gzip',
  '.tar': 'application/x-tar',
};

/**
 * Reads a file an agent wants to deliver. Only regular files inside the session's project directory
 * (after resolving symlinks) can leave the machine, never ~/.ssh or anything else.
 */
export async function readDeliverableFile(filePath: string, projectDirectory: string) {
  // Relative paths are relative to the session's project, not to the daemon's working directory.
  const [file, root] = await Promise.all([
    realpath(resolve(projectDirectory, filePath)),
    realpath(projectDirectory),
  ]);
  if (file !== root && !file.startsWith(root.endsWith(sep) ? root : root + sep)) {
    throw new Error('Only files inside the project directory can be delivered');
  }
  const info = await stat(file);
  if (!info.isFile()) throw new Error('Not a regular file');
  if (info.size === 0 || info.size > MAX_UPLOAD_BYTES)
    throw new Error('Files must be between 1 byte and 25 MB');
  const contentType = CONTENT_TYPES[extname(file).toLowerCase()];
  if (!contentType) throw new Error(`Unsupported file type ${extname(file) || '(none)'}`);
  const body = new Uint8Array(await readFile(file));
  return {
    fileName: basename(file),
    contentType,
    body,
    sizeBytes: body.byteLength,
    checksumSha256: createHash('sha256').update(body).digest('hex'),
  };
}
