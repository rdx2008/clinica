"use server";

import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { decryptField, encryptField } from "@/lib/crypto";
import { verifyTotp } from "@/lib/totp";
import { consumeBackupCode, generateBackupCodes, looksLikeBackupCode } from "@/lib/backup-codes";
import { createSession, destroySession, getCurrentUser, MFA_REQUIRED } from "@/lib/session";
import { audit, clientIp } from "@/lib/audit";
import { clearFailures, registerFailure, tooManyAttempts } from "@/lib/rate-limit";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type FormState = { error?: string; needsCode?: boolean; backupCodes?: string[]; link?: string; ok?: string };

const setupSchema = z.object({
  clinicName: z.string().trim().min(2, "Informe o nome da clínica"),
  name: z.string().trim().min(2, "Informe seu nome"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(12, "A senha deve ter ao menos 12 caracteres"),
});

// Só funciona enquanto não existe nenhum usuário (primeira instalação).
export async function setupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if ((await db.user.count()) > 0) return { error: "O sistema já foi configurado." };

  // Em produção a primeira configuração exige o código SETUP_TOKEN (definido no servidor),
  // para que ninguém "reivindique" a instalação antes do dono.
  const expected = process.env.SETUP_TOKEN;
  if (process.env.NODE_ENV === "production") {
    if (!expected) return { error: "Defina a variável SETUP_TOKEN no servidor para liberar a primeira configuração." };
    if (!safeEqual(String(formData.get("setupToken") ?? ""), expected)) return { error: "Código de configuração incorreto." };
  }

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
  const emailKey = `email|${email}`; // limite por conta, mesmo se o atacante trocar de IP
  if (tooManyAttempts(key) || tooManyAttempts(emailKey, 15)) return { error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." };

  const user = await db.user.findFirst({ where: { email, active: true } });
  // Executa a verificação mesmo sem usuário para não revelar, pelo tempo, se o e-mail existe.
  const hash = user?.passwordHash ?? "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86);
  const passwordOk = await verifyPassword(password, hash);

  if (!user || !passwordOk) {
    registerFailure(key);
    registerFailure(emailKey);
    if (user) await audit({ clinicId: user.clinicId, userId: user.id, action: "LOGIN_FALHA", entity: "User", entityId: user.id });
    return { error: "E-mail ou senha incorretos." };
  }

  if (user.mfaSecret) {
    if (!code) return { needsCode: true };
    let ok = false;
    if (looksLikeBackupCode(code)) {
      // Código de backup (uso único): serve quando o celular não está disponível.
      const left = consumeBackupCode(user.mfaBackupHashes, code);
      if (left) {
        await db.user.update({ where: { id: user.id }, data: { mfaBackupHashes: left } });
        await audit({ clinicId: user.clinicId, userId: user.id, action: "LOGIN_CODIGO_BACKUP", entity: "User", entityId: user.id });
        ok = true;
      }
    } else {
      ok = verifyTotp(decryptField(user.mfaSecret), code);
    }
    if (!ok) {
      registerFailure(key);
      registerFailure(emailKey);
      await audit({ clinicId: user.clinicId, userId: user.id, action: "LOGIN_MFA_FALHA", entity: "User", entityId: user.id });
      return { needsCode: true, error: "Código de verificação inválido." };
    }
  }

  clearFailures(key);
  clearFailures(emailKey);
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
  const { codes, hashes } = generateBackupCodes();
  await db.user.update({ where: { id: user.id }, data: { mfaSecret: encryptField(secret), mfaBackupHashes: hashes } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "MFA_ATIVADO", entity: "User", entityId: user.id });
  // Mostra os códigos de backup uma única vez; o formulário oferece o botão "Continuar".
  return { backupCodes: codes };
}
