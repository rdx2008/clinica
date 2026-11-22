import { after } from "next/server";
import { Prisma } from "@prisma/client";
import { handleInbound } from "@/lib/ai-runner";
import { handleConfirmationReply } from "@/lib/wa-confirm";
import { db } from "@/lib/db";
import { encryptField } from "@/lib/crypto";
import { isStopKeyword, parseWebhook, verifySignature, waToE164, WINDOW_MS } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Verificação do webhook pela Meta (configuração inicial no painel de desenvolvedores).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (expected && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === expected) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// Recebimento de mensagens e status. Idempotente: a Meta reenvia eventos, o waMessageId é único.
export async function POST(request: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET ?? "";
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const { messages, statuses } = parseWebhook(payload);
  const forAi: { conversationId: string; text: string }[] = [];

  try {
    for (const m of messages) {
      const account = await db.waAccount.findFirst({ where: { phoneNumberId: m.phoneNumberId }, select: { clinicId: true } });
      if (!account) continue; // número não cadastrado em nenhuma clínica
      const clinicId = account.clinicId;
      const phone = waToE164(m.from);

      const patient = await db.patient.findFirst({ where: { clinicId, phoneE164: phone }, select: { id: true } });
      const now = new Date();
      const conv = await db.waConversation.upsert({
        where: { clinicId_waContact: { clinicId, waContact: phone } },
        create: { clinicId, waContact: phone, patientId: patient?.id ?? null, lastMsgAt: m.at, windowExpiresAt: new Date(m.at.getTime() + WINDOW_MS), unread: 1 },
        update: { lastMsgAt: m.at, windowExpiresAt: new Date(m.at.getTime() + WINDOW_MS), unread: { increment: 1 }, ...(patient ? { patientId: patient.id } : {}) },
      });

      try {
        await db.waMessage.create({
          data: {
            conversationId: conv.id,
            direction: "ENTRADA",
            type: m.type,
            body: m.text ? encryptField(m.text) : null,
            waMessageId: m.id,
            status: "RECEBIDA",
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue; // reenvio já processado
        throw e;
      }

      if (m.type === "text" && m.text) forAi.push({ conversationId: conv.id, text: m.text });

      // Pedido de descadastro: revoga a autorização de WhatsApp do paciente (LGPD).
      if (patient && isStopKeyword(m.text)) {
        await db.consent.updateMany({
          where: { patientId: patient.id, type: "WHATSAPP_OPTIN", revokedAt: null },
          data: { revokedAt: now },
        });
        await db.auditLog.create({
          data: { clinicId, action: "WHATSAPP_OPTOUT_POR_MENSAGEM", entity: "Patient", entityId: patient.id },
        });
      }
    }

    for (const s of statuses) {
      const map: Record<string, string> = { sent: "ENVIADA", delivered: "ENTREGUE", read: "LIDA", failed: "FALHOU" };
      const status = map[s.status];
      if (!status) continue;
      await db.waMessage.updateMany({ where: { waMessageId: s.id }, data: { status, ...(s.error ? { error: s.error } : {}) } });
    }
  } catch {
    // 500 faz a Meta reenviar; a idempotência torna o reenvio seguro.
    return new Response("Error", { status: 500 });
  }
  // A IA responde depois de confirmar o recebimento à Meta (que espera resposta rápida).
  if (forAi.length) {
    after(async () => {
      for (const item of forAi) {
        try {
          // Confirmação/cancelamento por resposta curta tem prioridade; o resto vai para a IA (se ligada).
          if (await handleConfirmationReply(item.conversationId, item.text)) continue;
          await handleInbound(item.conversationId, item.text);
        } catch {
          // falha da IA nunca derruba o webhook; a conversa segue para atendimento humano
        }
      }
    });
  }
  return new Response("OK", { status: 200 });
}
