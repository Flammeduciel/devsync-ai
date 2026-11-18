import { describe, expect, it } from 'vitest';
import { isAllowedContentType, safeFileName, storageKeys } from '../server/domain/files';

describe('file rules', () => {
  it('accepts only the MIME types of the declared format and never SVG/HTML', () => {
    expect(isAllowedContentType('OPENAPI', 'application/yaml')).toBe(true);
    expect(isAllowedContentType('PDF', 'application/pdf; charset=binary')).toBe(true);
    expect(isAllowedContentType('IMAGE', 'image/svg+xml')).toBe(false);
    expect(isAllowedContentType('MARKDOWN', 'text/html')).toBe(false);
    expect(isAllowedContentType('GIT_REF', 'text/plain')).toBe(false);
  });
  it('strips paths and dangerous characters from file names', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('C:\\Users\\a\\Contrat API été.yaml')).toBe('Contrat-API-ete.yaml');
    expect(safeFileName('.htaccess')).toBe('htaccess');
    expect(safeFileName('///')).toBe('file');
  });
  it('builds tenant-prefixed keys', () => {
    expect(storageKeys.deliverable('t', 'd', 2, 'spec.yaml')).toBe('teams/t/deliverables/d/v2/spec.yaml');
  });
});
