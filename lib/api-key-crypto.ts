import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "enc:v1";
const ALGO = "aes-256-gcm";

function encryptionKey(): Buffer {
  const raw = process.env.API_SETTINGS_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("缺少环境变量 API_SETTINGS_ENCRYPTION_KEY，无法保存或读取用户 API Key");
  }
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  if (/^[A-Za-z0-9+/=]{44}$/.test(raw)) {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 32) return decoded;
  }
  return createHash("sha256").update(raw).digest();
}

export function isEncryptedApiKey(value: string): boolean {
  return value.startsWith(`${PREFIX}:`);
}

export function encryptApiKey(value: string): string {
  const plain = value.trim();
  if (!plain) return "";
  if (isEncryptedApiKey(plain)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptApiKey(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  if (!isEncryptedApiKey(raw)) return raw;
  const [, version, ivRaw, tagRaw, ciphertextRaw] = raw.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error("用户 API Key 加密格式无效");
  }
  const decipher = createDecipheriv(ALGO, encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64url")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}
