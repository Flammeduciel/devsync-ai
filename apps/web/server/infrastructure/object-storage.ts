import 'server-only';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStorage } from '../services/object-storage';
import { serverEnv } from '../env';
import { storage } from './storage';

const bucket = () => serverEnv().S3_BUCKET;

export const s3ObjectStorage: ObjectStorage = {
  async put(key, body, contentType) {
    await storage().send(
      new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
    );
  },
  presignPut(key, contentType, sizeBytes, expiresIn = 600) {
    return getSignedUrl(
      storage(),
      new PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        ContentType: contentType,
        ContentLength: sizeBytes,
      }),
      { expiresIn, signableHeaders: new Set(['content-type', 'content-length']) },
    );
  },
  presignGet(key, fileName, expiresIn = 300) {
    return getSignedUrl(
      storage(),
      new GetObjectCommand({
        Bucket: bucket(),
        Key: key,
        ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, '')}"`,
      }),
      { expiresIn },
    );
  },
  async head(key) {
    try {
      const r = await storage().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
      return {
        sizeBytes: Number(r.ContentLength ?? 0),
        contentType: r.ContentType ?? 'application/octet-stream',
      };
    } catch {
      return null;
    }
  },
  async get(key) {
    try {
      const r = await storage().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
      return r.Body ? new Uint8Array(await r.Body.transformToByteArray()) : null;
    } catch {
      return null;
    }
  },
};
