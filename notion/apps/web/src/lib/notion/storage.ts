import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const BUCKET = process.env['MINIO_BUCKET'] ?? 'notion-files';

export const s3 = new S3Client({
  endpoint: process.env['MINIO_ENDPOINT'] ?? 'http://localhost:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env['MINIO_ACCESS_KEY'] ?? 'notion_minio',
    secretAccessKey: process.env['MINIO_SECRET_KEY'] ?? 'minio_secret_change_me',
  },
  forcePathStyle: true, // required for MinIO
});

export async function getUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

export async function getDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

export async function deleteFile(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }),
  );
}

export function fileKey(workspaceId: string, fileName: string): string {
  const timestamp = Date.now();
  return `${workspaceId}/${timestamp}-${fileName}`;
}
