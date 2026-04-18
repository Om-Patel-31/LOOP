import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl as getS3SignedUrl } from "@aws-sdk/s3-request-presigner";
import { Storage as GcsStorage } from "@google-cloud/storage";
import { config } from "../config.js";

const memoryObjects = new Map();

function contentTypeForEncrypted() {
  return "application/octet-stream";
}

function buildObjectKey(groupId, challengeId) {
  return `loop/${groupId}/${challengeId}/${Date.now()}-${randomUUID()}.bin`;
}

function ensureS3Client() {
  return new S3Client({
    region: config.awsRegion,
    credentials:
      config.awsAccessKeyId && config.awsSecretAccessKey
        ? {
            accessKeyId: config.awsAccessKeyId,
            secretAccessKey: config.awsSecretAccessKey,
          }
        : undefined,
  });
}

function ensureGcsClient() {
  return new GcsStorage({
    projectId: config.gcsProjectId || undefined,
    keyFilename: config.gcsKeyFile || undefined,
  });
}

export async function uploadEncryptedMedia({ groupId, challengeId, bytes }) {
  const objectKey = buildObjectKey(groupId, challengeId);

  if (config.storageProvider === "s3") {
    const s3 = ensureS3Client();
    await s3.send(
      new PutObjectCommand({
        Bucket: config.storageBucket,
        Key: objectKey,
        Body: bytes,
        ContentType: contentTypeForEncrypted(),
      })
    );

    return {
      objectKey,
      provider: "s3",
      bucket: config.storageBucket,
    };
  }

  if (config.storageProvider === "gcs") {
    const gcs = ensureGcsClient();
    const bucket = gcs.bucket(config.storageBucket);
    const file = bucket.file(objectKey);

    await file.save(bytes, {
      contentType: contentTypeForEncrypted(),
      resumable: false,
      metadata: {
        cacheControl: "private, max-age=0, no-store",
      },
    });

    return {
      objectKey,
      provider: "gcs",
      bucket: config.storageBucket,
    };
  }

  memoryObjects.set(objectKey, Buffer.from(bytes));

  return {
    objectKey,
    provider: "memory",
    bucket: "memory",
  };
}

export async function getEncryptedMediaAccess({ objectKey, provider, bucket }) {
  if (provider === "s3") {
    const s3 = ensureS3Client();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    });

    const signedUrl = await getS3SignedUrl(s3, command, { expiresIn: 60 });
    return { mode: "url", url: signedUrl };
  }

  if (provider === "gcs") {
    const gcs = ensureGcsClient();
    const file = gcs.bucket(bucket).file(objectKey);
    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 60_000,
    });

    return { mode: "url", url: signedUrl };
  }

  const payload = memoryObjects.get(objectKey);

  if (!payload) {
    return null;
  }

  return {
    mode: "inline",
    base64: payload.toString("base64"),
    contentType: contentTypeForEncrypted(),
  };
}
