import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "./db";
import { signToken, verifyToken } from "./token";

const COOKIE = "clinica_session";
const MAX_AGE_S = 60 * 60 * 8; // 8 horas

// Perfis que devem ter MFA ativo (dados clínicos / administração).
export const MFA_REQUIRED: Role[] = ["ADMIN", "PROFISSIONAL"];

export async function createSession(userId: string) {
  const now = Date.now();
  const token = signToken({ uid: userId, iat: now, exp: now + MAX_AGE_S * 1000 });
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

// Relê o usuário do banco a cada requisição: desativar um usuário ou trocar o perfil vale na hora.
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return null;
  const user = await db.user.findUnique({
    where: { id: payload.uid },
    select: {
      id: true,
      clinicId: true,
      name: true,
      email: true,
      role: true,
      active: true,
      mfaSecret: true,
      mustChangePassword: true,
      sessionsValidAfter: true,
      clinic: { select: { name: true } },
    },
  });
  if (!user || !user.active) return null;
  // Troca de senha/MFA derruba as sessões emitidas antes dela.
  if (user.sessionsValidAfter && (payload.iat ?? 0) < user.sessionsValidAfter.getTime()) return null;
  return user;
});

// Por padrão exige conta completa: senha provisória trocada e MFA ativo (quando obrigatório).
// Vale para páginas E ações de servidor, não só para o layout. As telas de configuração
// dessas etapas usam { incomplete: true }.
export async function requireUser(opts?: { incomplete?: boolean }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!opts?.incomplete) {
    if (user.mustChangePassword) redirect("/conta/senha");
    if (MFA_REQUIRED.includes(user.role) && !user.mfaSecret) redirect("/conta/mfa");
  }
  return user;
}

export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}
