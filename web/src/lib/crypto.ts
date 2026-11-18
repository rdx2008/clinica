import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

// Criptografia de campo: AES-256-GCM. Formato: v1:<iv>:<tag>:<dados> (base64url).
// Chave: FIELD_ENCRYPTION_KEY = 32 bytes em base64.

function getKey(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) throw new Error("FIELD_ENCRYPTION_KEY não definida");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("FIELD_ENCRYPTION_KEY deve ter 32 bytes (base64)");
  return key;
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(":");
}

export function decryptField(payload: string): string {
  const [version, iv, tag, data] = payload.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Formato de campo criptografado inválido");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

// Hash determinístico para busca/duplicidade sem expor o valor (ex.: CPF normalizado).
export function blindIndex(value: string): string {
  return createHmac("sha256", getKey()).update(value.trim().toLowerCase()).digest("base64url");
}
