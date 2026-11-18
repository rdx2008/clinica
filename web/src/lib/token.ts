import { createHmac, timingSafeEqual } from "node:crypto";

// Token assinado (HMAC-SHA256) para o cookie de sessão. Formato: <payload>.<assinatura>
// Segredo: SESSION_SECRET. O estado real (usuário ativo, perfil) é sempre relido do banco.

// iat (ms) permite invalidar sessões antigas quando a senha/MFA muda (User.sessionsValidAfter).
export type SessionPayload = { uid: string; exp: number; iat?: number };

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET deve ter ao menos 32 caracteres");
  return s;
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function signToken(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifyToken(token: string, nowMs = Date.now()): SessionPayload | null {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = Buffer.from(sign(data));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
    return payload.exp > nowMs ? payload : null;
  } catch {
    return null;
  }
}
