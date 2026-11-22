// Núcleo do portal do paciente (sem banco): sessão assinada, token de link e validação do endereço.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const LINK_TTL_MS = 20 * 60_000; // link por e-mail vale 20 minutos
export const PORTAL_SESSION_MS = 2 * 3600_000; // sessão do portal: 2 horas

const RESERVED = new Set(["api", "admin", "login", "setup", "portal", "www", "app", "static", "p"]);

// Endereço do portal: minúsculas, números e hífen (3 a 40), sem hífen nas pontas e fora das palavras reservadas.
export function validSlug(s: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/.test(s) && !RESERVED.has(s);
}

export function newLinkToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function key(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET deve ter ao menos 32 caracteres");
  return `${s}:portal`; // separação de domínio: um token do portal nunca vale como sessão da equipe
}

export type PortalSession = { clinicId: string; email: string; exp: number };

export function signPortalSession(p: PortalSession): string {
  const data = Buffer.from(JSON.stringify(p)).toString("base64url");
  const sig = createHmac("sha256", key()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyPortalSession(token: string, nowMs = Date.now()): PortalSession | null {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = Buffer.from(createHmac("sha256", key()).update(data).digest("base64url"));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as PortalSession;
    if (typeof p.clinicId !== "string" || typeof p.email !== "string" || typeof p.exp !== "number") return null;
    return p.exp > nowMs ? p : null;
  } catch {
    return null;
  }
}

export function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}
