"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, type Role } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession, getCurrentUser, requireRole } from "@/lib/session";
import { audit, clientIp } from "@/lib/audit";
import { generateBackupCodes } from "@/lib/backup-codes";
import { clearFailures, registerFailure, tooManyAttempts } from "@/lib/rate-limit";
import type { FormState } from "./auth";

const ROLES = ["ADMIN", "RECEPCAO", "PROFISSIONAL", "FINANCEIRO"] as const;

function back(msg?: string, ok?: string): never {
  const q = msg ? `?erro=${encodeURIComponent(msg)}` : ok ? `?ok=${encodeURIComponent(ok)}` : "";
  redirect(`/usuarios${q}`);
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  role: z.enum(ROLES),
  password: z.string().min(12, "A senha provisória deve ter ao menos 12 caracteres"),
  councilType: z.string().trim().optional(),
  councilNumber: z.string().trim().optional(),
});

export async function createUserAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(parsed.error.issues[0].message);
  const { name, email, role, password, councilType, councilNumber } = parsed.data;

  const passwordHash = await hashPassword(password);
  try {
    const created = await db.user.create({
      data: {
        clinicId: admin.clinicId,
        name,
        email,
        role,
        passwordHash,
        mustChangePassword: true,
        ...(role === "PROFISSIONAL"
          ? {
              professional: {
                create: {
                  clinicId: admin.clinicId,
                  councilType: councilType || null,
                  councilNumber: councilNumber || null,
                },
              },
            }
          : {}),
      },
    });
    await audit({ clinicId: admin.clinicId, userId: admin.id, action: "USUARIO_CRIADO", entity: "User", entityId: created.id });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") back("Já existe um usuário com esse e-mail.");
    throw e;
  }
  revalidatePath("/usuarios");
  back(undefined, "Usuário criado. Informe a senha provisória a ele; será pedida a troca no primeiro acesso.");
}

// Garante que a clínica não fique sem nenhum administrador ativo.
async function otherActiveAdmins(clinicId: string, exceptUserId: string) {
  return db.user.count({ where: { clinicId, role: "ADMIN", active: true, id: { not: exceptUserId } } });
}

async function targetUser(adminClinicId: string, formData: FormData) {
  const id = String(formData.get("userId") ?? "");
  const user = await db.user.findFirst({ where: { id, clinicId: adminClinicId } });
  if (!user) back("Usuário não encontrado.");
  return user;
}

export async function setActiveAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const user = await targetUser(admin.clinicId, formData);
  const active = formData.get("active") === "true";
  if (user.id === admin.id) back("Você não pode desativar a si mesmo.");
  if (!active && user.role === "ADMIN" && (await otherActiveAdmins(admin.clinicId, user.id)) === 0) {
    back("A clínica precisa de ao menos um administrador ativo.");
  }
  await db.user.update({ where: { id: user.id }, data: { active } });
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: active ? "USUARIO_ATIVADO" : "USUARIO_DESATIVADO", entity: "User", entityId: user.id });
  revalidatePath("/usuarios");
  back();
}

export async function setRoleAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const user = await targetUser(admin.clinicId, formData);
  const parsed = z.enum(ROLES).safeParse(formData.get("role"));
  if (!parsed.success) back("Perfil inválido.");
  const role: Role = parsed.data;
  if (user.id === admin.id) back("Você não pode alterar o próprio perfil.");
  if (user.role === "ADMIN" && role !== "ADMIN" && (await otherActiveAdmins(admin.clinicId, user.id)) === 0) {
    back("A clínica precisa de ao menos um administrador ativo.");
  }
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { role } });
    if (role === "PROFISSIONAL") {
      await tx.professional.upsert({
        where: { userId: user.id },
        update: {},
        create: { clinicId: admin.clinicId, userId: user.id },
      });
    }
  });
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: `PERFIL_${role}`, entity: "User", entityId: user.id });
  revalidatePath("/usuarios");
  back();
}

export async function resetPasswordAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const user = await targetUser(admin.clinicId, formData);
  const password = String(formData.get("password") ?? "");
  if (password.length < 12) back("A senha provisória deve ter ao menos 12 caracteres.");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true, sessionsValidAfter: new Date() } });
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: "SENHA_REDEFINIDA", entity: "User", entityId: user.id });
  back(undefined, "Senha provisória definida. Será pedida a troca no próximo acesso.");
}

export async function resetMfaAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const user = await targetUser(admin.clinicId, formData);
  await db.user.update({ where: { id: user.id }, data: { mfaSecret: null, sessionsValidAfter: new Date() } });
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: "MFA_REDEFINIDO", entity: "User", entityId: user.id });
  back(undefined, "Verificação em duas etapas removida; o usuário configurará de novo no próximo acesso.");
}

const passwordSchema = z.object({
  current: z.string().min(1, "Informe a senha atual"),
  next: z.string().min(12, "A nova senha deve ter ao menos 12 caracteres"),
});

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { current, next } = parsed.data;

  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(current, row.passwordHash))) return { error: "Senha atual incorreta." };
  if (current === next) return { error: "A nova senha deve ser diferente da atual." };

  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false, sessionsValidAfter: new Date() } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "SENHA_ALTERADA", entity: "User", entityId: user.id });
  await createSession(user.id); // outras sessões foram derrubadas; esta continua
  redirect("/dashboard");
}

// ---- Link de redefinição de senha (sem e-mail): o administrador gera e entrega ao usuário ----

const RESET_TTL_MS = 60 * 60_000; // 1 hora

function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

export async function createResetLinkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole("ADMIN");
  const target = await db.user.findFirst({ where: { id: String(formData.get("userId") ?? ""), clinicId: admin.clinicId } });
  if (!target) return { error: "Usuário não encontrado." };

  const token = randomBytes(32).toString("base64url");
  await db.user.update({
    where: { id: target.id },
    data: { resetTokenHash: sha256(token), resetTokenExpires: new Date(Date.now() + RESET_TTL_MS) },
  });
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: "LINK_REDEFINICAO_GERADO", entity: "User", entityId: target.id });

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return { link: `${proto}://${host}/redefinir/${token}` };
}

const redeemSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(12, "A senha deve ter ao menos 12 caracteres"),
  confirm: z.string(),
});

export async function redeemResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const key = `reset|${await clientIp()}`;
  if (tooManyAttempts(key, 10)) return { error: "Muitas tentativas. Aguarde alguns minutos." };
  const parsed = redeemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.password !== parsed.data.confirm) return { error: "As senhas não coincidem." };

  const user = await db.user.findFirst({
    where: { resetTokenHash: sha256(parsed.data.token), resetTokenExpires: { gt: new Date() }, active: true },
  });
  if (!user) {
    registerFailure(key);
    return { error: "Link inválido ou expirado. Peça um novo ao administrador." };
  }
  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.password),
      mustChangePassword: false,
      resetTokenHash: null,
      resetTokenExpires: null,
      sessionsValidAfter: new Date(),
    },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "SENHA_REDEFINIDA_POR_LINK", entity: "User", entityId: user.id });
  clearFailures(key);
  redirect("/login?redefinida=1");
}

// ---- Códigos de backup do MFA ----

export async function regenerateBackupCodesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.mfaSecret) return { error: "Ative a verificação em duas etapas antes." };
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(String(formData.get("password") ?? ""), row.passwordHash))) return { error: "Senha incorreta." };

  const { codes, hashes } = generateBackupCodes();
  await db.user.update({ where: { id: user.id }, data: { mfaBackupHashes: hashes } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CODIGOS_BACKUP_REGERADOS", entity: "User", entityId: user.id });
  return { backupCodes: codes };
}
