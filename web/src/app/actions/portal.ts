"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { requireRole } from "@/lib/session";
import { audit, clientIp } from "@/lib/audit";
import { clearFailures, registerFailure, tooManyAttempts } from "@/lib/rate-limit";
import { hashToken, LINK_TTL_MS, newLinkToken, normalizeEmail, validSlug } from "@/lib/portal-core";
import { endPortalSession, getPortalClinic, getPortalSession, patientsForEmail, startPortalSession } from "@/lib/portal";
import { mailConfigured, sendMail } from "@/lib/mail";
import { createPixForCharge, loadAsaas } from "@/lib/asaas";
import type { FormState } from "./auth";

async function origin(): Promise<string> {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

// ---- Paciente: pedir o link por e-mail ----

export async function requestPortalLinkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = String(formData.get("slug") ?? "");
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Informe um e-mail válido." };

  const ipKey = `portal|${await clientIp()}`;
  const mailKey = `portal-mail|${email}`;
  if (tooManyAttempts(ipKey, 10) || tooManyAttempts(mailKey, 3)) return { error: "Muitas tentativas. Aguarde alguns minutos." };
  registerFailure(ipKey);
  registerFailure(mailKey);

  const clinic = await getPortalClinic(slug);
  // Resposta idêntica exista ou não o cadastro: não revela quais e-mails são de pacientes.
  const generic: FormState = { ok: "Se este e-mail estiver cadastrado na clínica, enviamos um link de acesso. Ele vale por 20 minutos." };
  if (!clinic || !mailConfigured()) return generic;
  const patients = await patientsForEmail(clinic.id, email);
  if (patients.length === 0) return generic;

  const { token, hash } = newLinkToken();
  await db.portalLink.create({ data: { clinicId: clinic.id, email, tokenHash: hash, expiresAt: new Date(Date.now() + LINK_TTL_MS) } });
  const link = `${await origin()}/p/${slug}/acesso/${token}`;
  await sendMail({
    to: email,
    subject: `Seu acesso ao portal — ${clinic.name}`,
    text: `Olá!\n\nUse o link abaixo para acessar o portal da ${clinic.name} (vale por 20 minutos e só funciona uma vez):\n\n${link}\n\nSe você não pediu este acesso, ignore este e-mail.`,
  });
  await db.auditLog.create({ data: { clinicId: clinic.id, action: "PORTAL_LINK_ENVIADO", entity: "Clinic", entityId: clinic.id } });
  return generic;
}

// ---- Paciente: usar o link (botão na página, para não ser consumido por pré-visualização de e-mail) ----

export async function consumePortalLinkAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const token = String(formData.get("token") ?? "");
  const clinic = await getPortalClinic(slug);
  if (!clinic) redirect("/login");

  const link = await db.portalLink.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!link || link.usedAt || link.expiresAt < new Date() || link.clinicId !== clinic.id) {
    redirect(`/p/${slug}?erro=${encodeURIComponent("Link inválido ou expirado. Peça um novo.")}`);
  }
  await db.portalLink.update({ where: { id: link.id }, data: { usedAt: new Date() } });
  await startPortalSession(clinic.id, link.email);
  await db.auditLog.create({ data: { clinicId: clinic.id, action: "PORTAL_ACESSO", entity: "Clinic", entityId: clinic.id } });
  clearFailures(`portal-mail|${link.email}`);
  redirect(`/p/${slug}/inicio`);
}

export async function logoutPortalAction(formData: FormData) {
  await endPortalSession();
  redirect(`/p/${String(formData.get("slug") ?? "")}`);
}

// ---- Paciente: confirmar presença ----

export async function confirmAppointmentPortalAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const s = await getPortalSession(slug);
  if (!s) redirect(`/p/${slug}`);
  const patients = await patientsForEmail(s.clinic.id, s.email);
  const a = await db.appointment.findFirst({
    where: { id: String(formData.get("id") ?? ""), clinicId: s.clinic.id, patientId: { in: patients.map((p) => p.id) }, status: "AGENDADA", startsAt: { gt: new Date() } },
    select: { id: true },
  });
  if (a) {
    await db.appointment.update({ where: { id: a.id }, data: { status: "CONFIRMADA" } });
    await db.auditLog.create({ data: { clinicId: s.clinic.id, action: "AGENDAMENTO_CONFIRMADO_PORTAL", entity: "Appointment", entityId: a.id } });
  }
  revalidatePath(`/p/${slug}/inicio`);
  redirect(`/p/${slug}/inicio`);
}

// ---- Paciente: gerar o Pix de uma cobrança sua ----

export async function createPortalPixAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const s = await getPortalSession(slug);
  if (!s) redirect(`/p/${slug}`);
  const patients = await patientsForEmail(s.clinic.id, s.email);
  const c = await db.charge.findFirst({
    where: { id: String(formData.get("id") ?? ""), clinicId: s.clinic.id, patientId: { in: patients.map((p) => p.id) }, status: "PENDENTE" },
    select: { id: true, patientId: true },
  });
  if (!c) redirect(`/p/${slug}/inicio`);
  const fail = (m: string): never => redirect(`/p/${slug}/inicio?erro=${encodeURIComponent(m)}`);

  const ctx = await loadAsaas(s.clinic.id);
  if (!ctx) return fail("O pagamento online não está disponível. Fale com a clínica.");
  const p = await db.patient.findFirst({ where: { id: c.patientId }, select: { cpfEnc: true } });
  const r = await createPixForCharge(ctx, c.id, p?.cpfEnc ? decryptField(p.cpfEnc) : null);
  if (!r.ok) return fail("Não foi possível gerar o Pix agora. Fale com a clínica.");
  await db.auditLog.create({ data: { clinicId: s.clinic.id, action: "PIX_GERADO_PORTAL", entity: "Charge", entityId: c.id } });
  redirect(`/p/${slug}/pix/${c.id}`);
}

// ---- Equipe: endereço do portal e link manual ----

export async function savePortalSlugAction(formData: FormData) {
  const user = await requireRole("ADMIN");
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const back = (m?: string, ok?: string): never => redirect(`/configuracoes${m ? `?erro=${encodeURIComponent(m)}` : ok ? `?ok=${encodeURIComponent(ok)}` : ""}`);
  if (slug === "") {
    await db.clinic.update({ where: { id: user.clinicId }, data: { portalSlug: null } });
    return back(undefined, "Portal do paciente desativado.");
  }
  if (!validSlug(slug)) return back("Endereço inválido: use 3 a 40 letras minúsculas, números ou hífen.");
  const taken = await db.clinic.findFirst({ where: { portalSlug: slug, id: { not: user.clinicId } }, select: { id: true } });
  if (taken) return back("Esse endereço já está em uso. Escolha outro.");
  await db.clinic.update({ where: { id: user.clinicId }, data: { portalSlug: slug } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PORTAL_ENDERECO", entity: "Clinic", entityId: user.clinicId });
  back(undefined, "Portal do paciente ativado.");
}

// A recepção gera o link na hora (útil quando o paciente está presente ou o e-mail não está configurado).
export async function createPortalLinkForPatientAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN", "RECEPCAO");
  const clinic = await db.clinic.findUniqueOrThrow({ where: { id: user.clinicId }, select: { portalSlug: true } });
  if (!clinic.portalSlug) return { error: "Ative o portal em Configurações antes." };
  const p = await db.patient.findFirst({ where: { id: String(formData.get("patientId") ?? ""), clinicId: user.clinicId }, select: { id: true, email: true } });
  if (!p?.email) return { error: "O paciente precisa ter e-mail cadastrado." };

  const { token, hash } = newLinkToken();
  await db.portalLink.create({ data: { clinicId: user.clinicId, email: normalizeEmail(p.email), tokenHash: hash, expiresAt: new Date(Date.now() + 24 * 3600_000), createdBy: user.id } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PORTAL_LINK_GERADO", entity: "Patient", entityId: p.id });
  return { link: `${await origin()}/p/${clinic.portalSlug}/acesso/${token}` };
}
