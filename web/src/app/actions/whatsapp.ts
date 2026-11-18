"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { decryptField, encryptField } from "@/lib/crypto";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { sendText, windowOpen } from "@/lib/whatsapp";

const accountSchema = z.object({
  phoneNumberId: z.string().trim().regex(/^\d{5,25}$/, "ID do número inválido (apenas dígitos)"),
  wabaId: z.string().trim().regex(/^\d{5,25}$/, "ID da conta WhatsApp Business inválido (apenas dígitos)"),
  token: z.string().trim().optional(),
});

export async function saveAccountAction(formData: FormData) {
  const user = await requireRole("ADMIN");
  const back = (m: string): never => redirect(`/whatsapp/config?erro=${encodeURIComponent(m)}`);
  const parsed = accountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return back(parsed.error.issues[0].message);
  const d = parsed.data;

  const existing = await db.waAccount.findFirst({ where: { clinicId: user.clinicId } });
  if (!existing && !d.token) return back("Informe o token de acesso.");

  // Um número só pode pertencer a uma clínica (evita receber mensagens de outra).
  const taken = await db.waAccount.findFirst({ where: { phoneNumberId: d.phoneNumberId, clinicId: { not: user.clinicId } }, select: { id: true } });
  if (taken) return back("Esse número já está vinculado a outra clínica.");

  const data = { phoneNumberId: d.phoneNumberId, wabaId: d.wabaId, status: "ATIVA", ...(d.token ? { tokenEnc: encryptField(d.token) } : {}) };
  if (existing) await db.waAccount.update({ where: { id: existing.id }, data });
  else await db.waAccount.create({ data: { clinicId: user.clinicId, tokenEnc: encryptField(d.token!), ...data } });

  await audit({ clinicId: user.clinicId, userId: user.id, action: "WHATSAPP_CONFIGURADO", entity: "WaAccount", entityId: existing?.id ?? null });
  redirect("/whatsapp/config?ok=1");
}

export async function sendReplyAction(formData: FormData) {
  const user = await requireRole("ADMIN", "RECEPCAO");
  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const back = (m?: string): never => redirect(`/whatsapp/${id}${m ? `?erro=${encodeURIComponent(m)}` : ""}`);

  const conv = await db.waConversation.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!conv) redirect("/whatsapp");
  if (!body || body.length > 2000) return back("Escreva uma mensagem de até 2000 caracteres.");
  // Texto livre só é permitido por até 24h após a última mensagem do paciente (regra da Meta).
  if (!windowOpen(conv.windowExpiresAt)) return back("Janela de 24h encerrada: só é possível enviar mensagem modelo aprovada (ainda não disponível).");

  const account = await db.waAccount.findFirst({ where: { clinicId: user.clinicId, status: "ATIVA" } });
  if (!account) return back("WhatsApp não configurado.");

  const result = await sendText({ token: decryptField(account.tokenEnc), phoneNumberId: account.phoneNumberId, to: conv.waContact, body });
  await db.waMessage.create({
    data: {
      conversationId: conv.id,
      direction: "SAIDA",
      body: encryptField(body),
      waMessageId: result.ok ? result.id : null,
      status: result.ok ? "ENVIADA" : "FALHOU",
      error: result.ok ? null : result.error,
    },
  });
  await db.waConversation.update({ where: { id: conv.id }, data: { lastMsgAt: new Date(), aiState: "PAUSADA" } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: result.ok ? "WHATSAPP_ENVIADO" : "WHATSAPP_FALHA_ENVIO", entity: "WaConversation", entityId: conv.id });
  revalidatePath(`/whatsapp/${id}`);
  if (!result.ok) return back(result.error);
  back();
}

// Atendente assume ou devolve a conversa para a IA (usado quando a IA de recepção existir).
export async function setAiStateAction(formData: FormData) {
  const user = await requireRole("ADMIN", "RECEPCAO");
  const id = String(formData.get("id") ?? "");
  const state = String(formData.get("state") ?? "");
  if (state !== "ATIVA" && state !== "PAUSADA") redirect(`/whatsapp/${id}`);
  const r = await db.waConversation.updateMany({ where: { id, clinicId: user.clinicId }, data: { aiState: state } });
  if (r.count) await audit({ clinicId: user.clinicId, userId: user.id, action: `WHATSAPP_IA_${state}`, entity: "WaConversation", entityId: id });
  redirect(`/whatsapp/${id}`);
}
