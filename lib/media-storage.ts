import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

type MediaStorageConfig = {
  bucket: string;
  publicBaseUrl: string;
};

let client: S3Client | null = null;

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少 ${name}，无法使用 R2 媒体存储。`);
  return value;
}

function config(): MediaStorageConfig {
  return {
    bucket: env("R2_BUCKET"),
    publicBaseUrl: env("R2_PUBLIC_BASE_URL").replace(/\/+$/, ""),
  };
}

function r2Client(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: "auto",
    endpoint: env("R2_ENDPOINT"),
    credentials: {
      accessKeyId: env("R2_ACCESS_KEY_ID"),
      secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    },
  });
  return client;
}

export function safeMediaPathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120) || crypto.randomUUID();
}

export function mediaFileExtensionFromMime(mime: string, fallback = "bin"): string {
  const normalized = mime.toLowerCase().split(";")[0]?.trim() || "";
  if (normalized.includes("jpeg") || normalized === "image/jpg") return "jpg";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("bmp")) return "bmp";
  if (normalized.includes("quicktime")) return "mov";
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("mp4") || normalized.includes("m4v")) return "mp4";
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("aac")) return "aac";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("opus")) return "opus";
  if (normalized.includes("flac")) return "flac";
  if (normalized.includes("aiff")) return "aiff";
  return fallback;
}

export function publicMediaUrl(key: string): string {
  return `${config().publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function mediaObjectKeyFromPublicUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const base = process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  let publicUrl: URL;
  try {
    publicUrl = new URL(base);
  } catch {
    return null;
  }
  if (parsed.origin !== publicUrl.origin) return null;
  const basePath = publicUrl.pathname.replace(/\/+$/, "");
  if (basePath && !parsed.pathname.startsWith(`${basePath}/`)) return null;
  const rawKey = parsed.pathname.slice(basePath.length).replace(/^\/+/, "");
  return rawKey ? decodeURIComponent(rawKey) : null;
}

export function isR2MediaUrl(url: string): boolean {
  return mediaObjectKeyFromPublicUrl(url) != null;
}

export async function putMediaObject(input: {
  key: string;
  bytes: Uint8Array | Buffer;
  contentType: string;
}): Promise<string> {
  await r2Client().send(new PutObjectCommand({
    Bucket: config().bucket,
    Key: input.key,
    Body: input.bytes,
    ContentType: input.contentType,
  }));
  return publicMediaUrl(input.key);
}

export async function getMediaObject(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const response = await r2Client().send(new GetObjectCommand({
      Bucket: config().bucket,
      Key: key,
    }));
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) return null;
    return {
      bytes,
      contentType: response.ContentType || "application/octet-stream",
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "NoSuchKey" || name === "NotFound") return null;
    throw error;
  }
}

export async function deleteMediaObjects(keys: string[]): Promise<void> {
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  if (uniqueKeys.length === 0) return;
  for (let index = 0; index < uniqueKeys.length; index += 1000) {
    const batch = uniqueKeys.slice(index, index + 1000);
    await r2Client().send(new DeleteObjectsCommand({
      Bucket: config().bucket,
      Delete: {
        Objects: batch.map((Key) => ({ Key })),
        Quiet: true,
      },
    }));
  }
}

export async function deleteMediaPrefix(prefix: string): Promise<number> {
  let continuationToken: string | undefined;
  let deleted = 0;
  do {
    const listed = await r2Client().send(new ListObjectsV2Command({
      Bucket: config().bucket,
      Prefix: prefix.replace(/^\/+/, ""),
      ContinuationToken: continuationToken,
    }));
    const keys = (listed.Contents ?? []).map((item) => item.Key).filter((key): key is string => Boolean(key));
    await deleteMediaObjects(keys);
    deleted += keys.length;
    continuationToken = listed.NextContinuationToken;
  } while (continuationToken);
  return deleted;
}

export async function copyRemoteMediaToStorage(input: {
  sourceUrl: string;
  key: string;
  contentType?: string;
  timeoutMs?: number;
}): Promise<string> {
  const res = await fetch(input.sourceUrl, { signal: AbortSignal.timeout(input.timeoutMs ?? 90_000) });
  if (!res.ok) throw new Error(`拉取媒体失败 (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.byteLength) throw new Error("远程媒体为空");
  return putMediaObject({
    key: input.key,
    bytes,
    contentType: input.contentType || res.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream",
  });
}
