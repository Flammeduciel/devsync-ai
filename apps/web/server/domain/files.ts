import type { DeliverableFormat } from '@devsync/validation';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_INLINE_BYTES = 1024 * 1024;

/**
 * Accepted MIME types per deliverable format. SVG and HTML are refused on purpose: they can carry
 * scripts and would be served from our storage domain.
 */
export const FORMAT_CONTENT_TYPES: Record<
  Exclude<DeliverableFormat, 'GIT_REF' | 'PULL_REQUEST'>,
  string[]
> = {
  MARKDOWN: ['text/markdown', 'text/plain'],
  JSON: ['application/json'],
  OPENAPI: ['application/yaml', 'application/x-yaml', 'text/yaml', 'application/json'],
  PDF: ['application/pdf'],
  IMAGE: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  ARCHIVE: ['application/zip', 'application/gzip', 'application/x-tar', 'application/x-gzip'],
};

/** Formats whose content can be sent inline (text) instead of uploaded. */
export const INLINE_FORMATS: DeliverableFormat[] = ['MARKDOWN', 'JSON', 'OPENAPI'];

export const ATTACHMENT_CONTENT_TYPES = [...new Set(Object.values(FORMAT_CONTENT_TYPES).flat())];

export function isAllowedContentType(format: DeliverableFormat, contentType: string): boolean {
  if (format === 'GIT_REF' || format === 'PULL_REQUEST') return false;
  return FORMAT_CONTENT_TYPES[format].includes(contentType.toLowerCase().split(';')[0]!.trim());
}

/** Keeps a readable, path-free, ASCII file name (never trusted for anything but display/download). */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 120);
  return cleaned || 'file';
}

export const storageKeys = {
  deliverable: (teamId: string, deliverableId: string, version: number, fileName: string) =>
    `teams/${teamId}/deliverables/${deliverableId}/v${version}/${safeFileName(fileName)}`,
  attachment: (teamId: string, attachmentId: string, fileName: string) =>
    `teams/${teamId}/attachments/${attachmentId}/${safeFileName(fileName)}`,
};
