"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { decryptField, encryptField } from "@/lib/crypto";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { placeholderCount, renderTemplate, sendTemplate, waToE164 } from "@/lib/whatsapp";
import { fetchMetaTemplates, mapMetaStatus } from "@/lib/wa-meta";
import { localDate, localTime } from "@/lib/agenda";
import { reminderVars } from "@/lib/reminders";

// ---- Atribuição, notas internas e respostas rápidas ----

export async function assignConversationAction(formData: FormData) {
  const user = await requireRole("ADMIN", "RECEPCAO");
  const id = String(formData.get("id") ?? "");
  const to = String(formData.get("userId") ?? "");
  if (to) {
    const target = await db.user.findFirst({ where: { id: to, clinicId: user.clinicId, active: true, role: { in: ["ADMIN", "RECEPCAO"] } }, select: { id: true } });
    if (!target) redirect(`/whatsapp/${id}?erro=${encodeURIComponent("Usuário inválido.")}`);
  }
  const r = await db.waConversation.updateMany({ where: { id, clinicId: user.clinicId }, data: { assignedTo: to || null } });
  if (r.count) await audit({ clinicId: user.clinicId, userId: user.id, action: "WHATSAPP_ATRIBUIDA", entity: "WaConversation", entityId: id });
  redirect(`/whatsapp/${id}`);
}

export async function addNoteAction(formData: FormData) {
  const user = await requireRole("ADMIN", "RECEPCAO");
  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const conv = await db.waConversation.findFirst({ where: { id, clinicId: user.clinicId }, select: { id: true } });
  if (!conv) redirect("/whatsapp");
  if (!body || body.length > 1000) redirect(`/whatsapp/${id}?erro=${encodeURIComponent("Escreva uma nota de até 1000 caracteres.")}`);
  await db.waNote.create({ data: { conversationId: id, authorId: user.id, body: encryptField(body) } });
  redirect(`/whatsapp/${id}`);
}

export async function createQuickReplyAction(formData: FormData) {
  const user = await requireRole("ADMIN", "RECEPCAO");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (title.length < 2 || title.length > 40 || body.length < 2 || body.length > 1000) {
    redirect(`/whatsapp/respostas?erro=${encodeURIComponent("Informe um título (até 40) e o texto (até 1000 caracteres).")}`);
  }
  const q = await db.quickReply.create({ data: { clinicId: user.clinicId, title, body } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "RESPOSTA_RAPIDA_CRIADA", entity: "QuickReply", entityId: q.id });
  redirect("/whatsapp/respostas");
}

export async function deleteQuickReplyAction(formData: FormData) {
  const user = await requireRole("ADMIN", "RECEPCAO");
  await db.quickReply.deleteMany({ where: { id: String(formData.get("id") ?? ""), clinicId: user.clinicId } });
  redirect("/whatsapp/respostas");
}

// ---- Envio manual de modelo aprovado (inicia ou retoma conversa) ----

export async function sendTemplateManualAction(formData: FormData) {
  const user = await requireRole("ADMIN", "RECEPCAO");
  const patientId = String(formData.get("patientId") ?? "");
  const templateId = String(formData.get("templateId") ?? "");
  const back = (m: string): never => redirect(`/whatsapp/nova?patient=${patientId}&erro=${encodeURIComponent(m)}`);

  const [patient, template, account] = await Promise.all([
    db.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId } }),
    db.waTemplate.findFirst({ where: { id: templateId, clinicId: user.clinicId, status: "APROVADO" } }),
    db.waAccount.findFirst({ where: { clinicId: user.clinicId, status: "ATIVA" } }),
  ]);
  if (!patient?.phoneE164) return back("O paciente precisa ter telefone cadastrado.");
  if (!template) return back("Selecione um modelo aprovado.");
  if (!account) return back("WhatsApp não configurado.");
  const optin = await db.consent.findFirst({ where: { patientId, type: "WHATSAPP_OPTIN", revokedAt: null }, select: { id: true } });
  if (!optin) return back("O paciente não autorizou contato por WhatsApp.");

  const next = await db.appointment.findFirst({
    where: { clinicId: user.clinicId, patientId, status: { in: ["AGENDADA", "CONFIRMADA"] }, startsAt: { gt: new Date() } },
    orderBy: { startsAt: "asc" },
    include: { professional: { include: { user: { select: { name: true } } } } },
  });
  const needed = placeholderCount(template.body);
  if (needed > 1 && !next) return back("Esse modelo usa data e horário, mas o paciente não tem atendimento futuro.");
  const vars = reminderVars({
    patientName: patient.fullName,
    date: next ? localDate(next.startsAt) : localDate(new Date()),
    time: next ? localTime(next.startsAt) : "",
    professional: next?.professional.user.name ?? "",
  }).slice(0, needed);

  const result = await sendTemplate({
    token: decryptField(account.tokenEnc),
    phoneNumberId: account.phoneNumberId,
    to: patient.phoneE164,
    name: template.name,
    language: template.language,
    vars,
  });
  const contact = waToE164(patient.phoneE164);
  const conv = await db.waConversation.upsert({
    where: { clinicId_waContact: { clinicId: user.clinicId, waContact: contact } },
    create: { clinicId: user.clinicId, waContact: contact, patientId, aiState: "PAUSADA" },
    update: { patientId, lastMsgAt: new Date() },
  });
  await db.waMessage.create({
    data: {
      conversationId: conv.id,
      direction: "SAIDA",
      type: "template",
      body: encryptField(renderTemplate(template.body, vars)),
      templateId: template.id,
      waMessageId: result.ok ? result.id : null,
      status: result.ok ? "ENVIADA" : "FALHOU",
      error: result.ok ? null : result.error,
    },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: result.ok ? "WHATSAPP_MODELO_ENVIADO" : "WHATSAPP_MODELO_FALHA", entity: "WaConversation", entityId: conv.id });
  if (!result.ok) return back(result.error);
  redirect(`/whatsapp/${conv.id}`);
}

// ---- Sincronizar modelos com a Meta ----

export async function syncTemplatesAction() {
  const user = await requireRole("ADMIN");
  const back = (m?: string, ok?: string): never =>
    redirect(`/whatsapp/automacoes${m ? `?erro=${encodeURIComponent(m)}` : ok ? `?ok=${encodeURIComponent(ok)}` : ""}`);
  const account = await db.waAccount.findFirst({ where: { clinicId: user.clinicId, status: "ATIVA" } });
  if (!account) return back("Configure o WhatsApp antes de sincronizar.");

  const res = await fetchMetaTemplates({ token: decryptField(account.tokenEnc), wabaId: account.wabaId });
  if (!res.ok) return back(res.error);

  let created = 0;
  let updated = 0;
  for (const t of res.templates) {
    if (!/^[a-z0-9_]{1,100}$/.test(t.name) || !t.body) continue;
    const category = ["UTILITY", "MARKETING", "AUTHENTICATION"].includes(t.category) ? t.category : "UTILITY";
    const existing = await db.waTemplate.findFirst({ where: { clinicId: user.clinicId, name: t.name, language: t.language } });
    if (existing) {
      await db.waTemplate.update({ where: { id: existing.id }, data: { status: mapMetaStatus(t.status), body: t.body, category } });
      updated++;
    } else {
      await db.waTemplate.create({ data: { clinicId: user.clinicId, name: t.name, language: t.language, category, body: t.body, status: mapMetaStatus(t.status) } });
      created++;
    }
  }
  await audit({ clinicId: user.clinicId, userId: user.id, action: "WHATSAPP_MODELOS_SINCRONIZADOS", entity: "WaTemplate" });
  back(undefined, `Sincronizado: ${created} novo(s), ${updated} atualizado(s).`);
}
