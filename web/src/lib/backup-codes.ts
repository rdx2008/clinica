import { createHash, randomBytes } from "node:crypto";

// Códigos de backup do MFA: uso único, formato xxxx-xxxx (sem caracteres ambíguos).
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function hash(code: string): string {
  return createHash("sha256").update(normalize(code)).digest("hex");
}

export function normalize(code: string): string {
  return code.replace(/[\s-]/g, "").toLowerCase();
}

export function generateBackupCodes(count = 8): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: count }, () => {
    const bytes = randomBytes(8);
    let s = "";
    for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
  return { codes, hashes: codes.map(hash) };
}

export function looksLikeBackupCode(input: string): boolean {
  return /^[a-z0-9]{8}$/.test(normalize(input));
}

// Consome um código: devolve a nova lista de hashes (sem o usado) ou null se não existir.
export function consumeBackupCode(hashes: string[], input: string): string[] | null {
  const h = hash(input);
  const i = hashes.indexOf(h);
  if (i < 0) return null;
  return hashes.filter((_, idx) => idx !== i);
}
