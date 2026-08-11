import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1";

function encryptionKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("APP_ENCRYPTION_KEY_MISSING");
  }

  // Accept 32-byte base64, 64-char hex, or any passphrase hashed to 32 bytes.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  try {
    const asB64 = Buffer.from(raw, "base64");
    if (asB64.length === 32) return asB64;
  } catch {
    // fall through
  }
  return createHash("sha256").update(raw).digest();
}

/** AES-256-GCM. Format: `v1:<iv_b64>:<tag_b64>:<ciphertext_b64>`. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(
    ":",
  );
}

export function decryptSecret(payload: string): string {
  const [prefix, ivB64, tagB64, dataB64] = payload.split(":");
  if (prefix !== PREFIX || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("ENCRYPTED_SECRET_INVALID");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function hasEncryptionKey(): boolean {
  return Boolean(process.env.APP_ENCRYPTION_KEY);
}
