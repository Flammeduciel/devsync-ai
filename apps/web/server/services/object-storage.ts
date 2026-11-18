/** Object storage port (S3/MinIO in production, in-memory in tests). Keys are opaque strings. */
export interface ObjectStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Pre-signed upload URL; the signature binds content type and exact length. */
  presignPut(key: string, contentType: string, sizeBytes: number, expiresInSeconds?: number): Promise<string>;
  /** Pre-signed download URL served as an attachment. */
  presignGet(key: string, fileName: string, expiresInSeconds?: number): Promise<string>;
  head(key: string): Promise<{ sizeBytes: number; contentType: string } | null>;
  get(key: string): Promise<Uint8Array | null>;
}

export class MemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();

  async put(key: string, body: Uint8Array, contentType: string) {
    this.objects.set(key, { body, contentType });
  }
  async presignPut(key: string) {
    return `memory://upload/${encodeURIComponent(key)}`;
  }
  async presignGet(key: string, fileName: string) {
    return `memory://download/${encodeURIComponent(key)}?name=${encodeURIComponent(fileName)}`;
  }
  async head(key: string) {
    const o = this.objects.get(key);
    return o ? { sizeBytes: o.body.byteLength, contentType: o.contentType } : null;
  }
  async get(key: string) {
    return this.objects.get(key)?.body ?? null;
  }
}
