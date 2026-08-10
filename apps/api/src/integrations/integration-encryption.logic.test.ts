import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  parseIntegrationEncryptionKey,
} from "./integration-encryption.logic.js";

const testKey = parseIntegrationEncryptionKey(
  Buffer.from("0123456789abcdef0123456789abcdef").toString("base64"),
);

describe("integration-encryption.logic", () => {
  it("encrypts and decrypts with v1 prefix", () => {
    const encrypted = encryptIntegrationSecret("refresh-token-value", testKey);
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(decryptIntegrationSecret(encrypted, testKey)).toBe("refresh-token-value");
  });

  it("accepts hex-encoded 32-byte keys", () => {
    const hexKey = randomBytes(32).toString("hex");
    const key = parseIntegrationEncryptionKey(hexKey);
    expect(key.length).toBe(32);
  });

  it("rejects invalid key lengths", () => {
    expect(() => parseIntegrationEncryptionKey("too-short")).toThrow(
      "INTEGRATION_ENCRYPTION_KEY must decode to 32 bytes",
    );
  });
});
