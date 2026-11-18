import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDeliverableFile } from '../src/files/upload';

describe('readDeliverableFile', () => {
  it('reads files of the project and rejects escapes, symlinks out and unknown types', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ds-up-'));
    const outside = await mkdtemp(join(tmpdir(), 'ds-out-'));
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'docs', 'openapi.yaml'), 'openapi: 3.1.0\n');
    await writeFile(join(outside, 'id_rsa'), 'secret');
    await symlink(join(outside, 'id_rsa'), join(root, 'key.yaml'));
    await writeFile(join(root, 'run.sh'), 'echo');

    await expect(readDeliverableFile(join(root, 'docs', 'openapi.yaml'), root)).resolves.toMatchObject({ fileName: 'openapi.yaml', contentType: 'application/yaml', sizeBytes: 15 });
    await expect(readDeliverableFile(join(outside, 'id_rsa'), root)).rejects.toThrow('inside the project');
    await expect(readDeliverableFile(join(root, 'key.yaml'), root)).rejects.toThrow('inside the project');
    await expect(readDeliverableFile(join(root, 'run.sh'), root)).rejects.toThrow('Unsupported');
  });
});
