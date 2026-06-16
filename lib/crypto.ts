import crypto from "crypto";

/**
 * Symmetric encryption for OAuth tokens at rest (AES-256-GCM).
 * The key comes from CONNECTIONS_ENC_KEY (a 32-byte / 64-hex-char secret).
 * The database only ever stores ciphertext produced here.
 */
const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.CONNECTIONS_ENC_KEY;
  if (!hex || hex.replace(/[^0-9a-fA-F]/g, "").length < 64) {
    throw new Error(
      "CONNECTIONS_ENC_KEY must be a 32-byte hex string (64 hex chars). " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(hex.slice(0, 64), "hex");
}

/** Encrypt a UTF-8 string → base64(iv | authTag | ciphertext). */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/** Reverse of encryptSecret. */
export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
