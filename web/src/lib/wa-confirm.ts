import { db } from "./db";
import { decryptField, encryptField } from "./crypto";
import { localDate, localTime, nowPlus } from "./agenda";
import { parseConfirmationReply, sendText } from "./whatsapp";

// Trata a resposta do paciente a um lembrete ("1"/"sim" confirma; "2"/"não" pede cancelamento).
// Devolve true quando a mensagem foi tratada (e a IA não deve responder).
export async function handleConfirmationReply(conversationId: string, text: string): Promise<boolean> {
  const intent = parseConfirmationReply(text);
  if (!intent) return false;

  const conv = await db.waConversation.findUnique({ where: { id: conversationId } });
  if (!conv?.patientId) return false;

  const now = nowPlus(0);
  const appt = await db.appointment.findFirst({
    where: {
      clinicId: conv.clinicId,
      patientId: conv.patientId,
      status: { in: ["AGENDADA", "CONFIRMADA"] },
      startsAt: { gt: now, lt: nowPlus(72 * 3600_000) },
    },
    orderBy: { startsAt: "asc" },
    include: { service: { select: { name: true } } },
  });
  if (!appt) return false;

  const account = await db.waAccount.findFirst({ where: { clinicId: conv.clinicId, status: "ATIVA" } });
  const when = `${localDate(appt.startsAt).split("-").reverse().join("/")} às ${localTime(appt.startsAt)}`;
  let reply: string;

  if (intent === "CONFIRMA") {
    if (appt.status !== "CONFIRMADA") await db.appointment.update({ where: { id: appt.id }, data: { status: "CONFIRMADA" } });
    await db.auditLog.create({ data: { clinicId: conv.clinicId, action: "AGENDAMENTO_CONFIRMADO_WHATSAPP", entity: "Appointment", entityId: appt.id } });
    reply = `Consulta confirmada para ${when}. Até lá!`;
  } else {
    // Não cancela sozinho: a equipe decide (pode haver política de cancelamento ou remarcação).
    await db.auditLog.create({ data: { clinicId: conv.clinicId, action: "PEDIDO_CANCELAMENTO_WHATSAPP", entity: "Appointment", entityId: appt.id } });
    await db.waConversation.update({ where: { id: conv.id }, data: { aiState: "TRANSFERIDA" } });
    reply = "Entendido. Nossa equipe vai entrar em contato para cancelar ou remarcar a sua consulta.";
  }

  if (account) {
    const r = await sendText({ token: decryptField(account.tokenEnc), phoneNumberId: account.phoneNumberId, to: conv.waContact, body: reply });
    await db.waMessage.create({
      data: {
        conversationId: conv.id,
        direction: "SAIDA",
        body: encryptField(reply),
        waMessageId: r.ok ? r.id : null,
        status: r.ok ? "ENVIADA" : "FALHOU",
        error: r.ok ? null : r.error,
      },
    });
  }
  return true;
}
