/**
 * Canonical resource key so "./src/a.ts" and "src/a.ts" are the same claim. File and directory keys
 * are repository-relative POSIX paths; escaping the repository ("..") is refused.
 */
export function normalizeResourceKey(type: 'FILE' | 'DIRECTORY' | 'API_CONTRACT' | 'TOPIC', key: string): string | null {
  const trimmed = key.trim();
  if (type === 'API_CONTRACT' || type === 'TOPIC') return trimmed.toLowerCase().replace(/\s+/g, ' ') || null;
  const parts = trimmed.replace(/\\/g, '/').split('/').filter((p) => p && p !== '.');
  if (parts.length === 0 || parts.some((p) => p === '..') || trimmed.startsWith('/')) return null;
  return type === 'DIRECTORY' ? `${parts.join('/')}/` : parts.join('/');
}
