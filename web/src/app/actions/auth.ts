"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { decryptField, encryptField } from "@/lib/crypto";
import { verifyTotp } from "@/lib/totp";
import { createSession, destroySession, getCurrentUser, MFA_REQUIRED } from "@/lib/session";
import { audit, clientIp } from "@/lib/audit";
import { clearFailures, registerFailure, tooManyAttempts } from "@/lib/rate-limit";

export type FormState = { error?: string; needsCode?: boolean };

const setupSchema = z.object({
  clinicName: z.string().trim().min(2, "Informe o nome da clínica"),
  name: z.string().trim().min(2, "Informe seu nome"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(12, "A senha deve ter ao menos 12 caracteres"),
});

// Só funciona enquanto não existe nenhum usuário (primeira instalação).
export async function setupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if ((await db.user.count()) > 0) return { error: "O sistema já foi configurado." };

  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { clinicName, name, email, password } = parsed.data;

  const passwordHash = await hashPassword(password);
  const user = await db.$transaction(async (tx) => {
    // Revalida dentro da transação para evitar dois "primeiros" cadastros simultâneos.
    if ((await tx.user.count()) > 0) return null;
    const clinic = await tx.clinic.create({ data: { name: clinicName } });
    return tx.user.create({ data: { clinicId: clinic.id, name, email, passwordHash, role: "ADMIN" } });
  });
  if (!user) return { error: "O sistema já foi configurado." };

  await audit({ clinicId: user.clinicId, userId: user.id, action: "SETUP", entity: "Clinic", entityId: user.clinicId });
  await createSession(user.id);
  redirect("/conta/mfa");
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  code: z.string().optional(),
});

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Informe e-mail e senha." };
  const { email, password, code } = parsed.data;

  const key = `${await clientIp()}|${email}`;
  if (tooManyAttempts(key)) return { error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." };

  const user = await db.user.findFirst({ where: { email, active: true } });
  // Executa a verificação mesmo sem usuário para não revelar, pelo tempo, se o e-mail existe.
  const hash = user?.passwordHash ?? "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86);
  const passwordOk = await verifyPassword(password, hash);

  if (!user || !passwordOk) {
    registerFailure(key);
    if (user) await audit({ clinicId: user.clinicId, userId: user.id, action: "LOGIN_FALHA", entity: "User", entityId: user.id });
    return { error: "E-mail ou senha incorretos." };
  }

  if (user.mfaSecret) {
    if (!code) return { needsCode: true };
    if (!verifyTotp(decryptField(user.mfaSecret), code)) {
      registerFailure(key);
      await audit({ clinicId: user.clinicId, userId: user.id, action: "LOGIN_MFA_FALHA", entity: "User", entityId: user.id });
      return { needsCode: true, error: "Código de verificação inválido." };
    }
  }

  clearFailures(key);
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LOGIN", entity: "User", entityId: user.id });
  await createSession(user.id);
  if (user.mustChangePassword) redirect("/conta/senha");
  redirect(!user.mfaSecret && MFA_REQUIRED.includes(user.role) ? "/conta/mfa" : "/dashboard");
}

export async function logoutAction() {
  const user = await getCurrentUser();
  if (user) await audit({ clinicId: user.clinicId, userId: user.id, action: "LOGOUT", entity: "User", entityId: user.id });
  await destroySession();
  redirect("/login");
}

export async function enableMfaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const secret = String(formData.get("secret") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!/^[A-Z2-7]{32}$/.test(secret) || !verifyTotp(secret, code)) {
    return { error: "Código inválido. Confira o aplicativo e tente de novo." };
  }
  await db.user.update({ where: { id: user.id }, data: { mfaSecret: encryptField(secret) } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "MFA_ATIVADO", entity: "User", entityId: user.id });
  redirect("/dashboard");
}
