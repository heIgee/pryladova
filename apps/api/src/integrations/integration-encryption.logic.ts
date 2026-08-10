import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION_PREFIX = "v1";

export const parseIntegrationEncryptionKey = (encoded: string): Buffer => {
  const trimmed = encoded.trim();
  const fromBase64 = Buffer.from(trimmed, "base64");
  if (fromBase64.length === 32) {
    return fromBase64;
  }
  const fromHex = Buffer.from(trimmed, "hex");
  if (fromHex.length === 32) {
    return fromHex;
  }
  throw new Error("INTEGRATION_ENCRYPTION_KEY must decode to 32 bytes (base64 or hex)");
};

export const encryptIntegrationSecret = (plaintext: string, key: Buffer): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION_PREFIX}:${iv.toString("base64url")}:${ciphertext.toString("base64url")}:${tag.toString("base64url")}`;
};

export const decryptIntegrationSecret = (encoded: string, key: Buffer): string => {
  const parts = encoded.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION_PREFIX) {
    throw new Error("Unsupported integration secret ciphertext format");
  }
  const iv = Buffer.from(parts[1] ?? "", "base64url");
  const ciphertext = Buffer.from(parts[2] ?? "", "base64url");
  const tag = Buffer.from(parts[3] ?? "", "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
};
