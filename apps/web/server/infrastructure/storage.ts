import 'server-only';
import { CreateBucketCommand, HeadBucketCommand, PutBucketVersioningCommand, S3Client } from '@aws-sdk/client-s3';
import { serverEnv } from '../env';

const globalForS3 = globalThis as unknown as { __devsyncS3?: S3Client };

export function storage(): S3Client {
  const env = serverEnv();
  globalForS3.__devsyncS3 ??= new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
  return globalForS3.__devsyncS3;
}

export async function bucketExists(): Promise<boolean> {
  try {
    await storage().send(new HeadBucketCommand({ Bucket: serverEnv().S3_BUCKET }));
    return true;
  } catch {
    return false;
  }
}

/** Creates the bucket with versioning enabled (deliverables are versioned). Idempotent. */
export async function ensureBucket(): Promise<void> {
  if (await bucketExists()) return;
  const Bucket = serverEnv().S3_BUCKET;
  await storage().send(new CreateBucketCommand({ Bucket }));
  await storage().send(
    new PutBucketVersioningCommand({ Bucket, VersioningConfiguration: { Status: 'Enabled' } }),
  );
}
