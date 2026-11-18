import { db } from "./db";
import { decryptField, encryptField } from "./crypto";
import { sendText, windowOpen } from "./whatsapp";
import {
  buildSystemPrompt,
  callModel,
  DEFAULT_CRISIS_MESSAGE,
  DEFAULT_HANDOFF_MESSAGE,
  detectCrisis,
  normalizeTurns,
  parseAiReply,
  type ChatTurn,
} from "./ai";

const MAX_REPLIES_PER_HOUR = 6;

type Cfg = { enabled?: boolean; info?: string };
type Msgs = { message?: string };

// Trata uma mensagem recebida: crise e dúvidas vão para humano; o resto a IA responde com o conteúdo aprovado.
export async function handleInbound(conversationId: string, text: string) {
  const conv = await db.waConversation.findUnique({ where: { id: conversationId }, include: { clinic: { select: { name: true } } } });
  if (!conv || conv.aiState !== "ATIVA" || !windowOpen(conv.windowExpiresAt)) return;

  const config = await db.aiConfig.findUnique({ where: { clinicId: conv.clinicId } });
  const cfg = (config?.approvedContent ?? {}) as Cfg;
  if (!config || !cfg.enabled) return;

  const account = await db.waAccount.findFirst({ where: { clinicId: conv.clinicId, status: "ATIVA" } });
  if (!account) return;
  const token = decryptField(account.tokenEnc);

  const say = async (body: string) => {
    const r = await sendText({ token, phoneNumberId: account.phoneNumberId, to: conv.waContact, body });
    await db.waMessage.create({
      data: {
        conversationId: conv.id,
        direction: "SAIDA",
        body: encryptField(body),
        waMessageId: r.ok ? r.id : null,
        status: r.ok ? "ENVIADA" : "FALHOU",
        error: r.ok ? null : r.error,
      },
    });
    await db.waConversation.update({ where: { id: conv.id }, data: { lastMsgAt: new Date() } });
  };
  const event = (intent: string, action: string, handoffReason?: string) =>
    db.aiEvent.create({ data: { conversationId: conv.id, intent, action, handoffReason: handoffReason ?? null } });
  const handoff = async (intent: string, reason: string, message: string) => {
    await say(message);
    await db.waConversation.update({ where: { id: conv.id }, data: { aiState: "TRANSFERIDA" } });
    await event(intent, "TRANSFERIU", reason);
    await db.auditLog.create({ data: { clinicId: conv.clinicId, action: `IA_TRANSFERENCIA_${intent.toUpperCase()}`, entity: "WaConversation", entityId: conv.id } });
  };

  const handoffMsg = ((config.rules ?? {}) as Msgs).message || DEFAULT_HANDOFF_MESSAGE;

  // 1) Protocolo de crise: determinístico, antes de qualquer modelo.
  if (detectCrisis(text)) {
    const msg = ((config.crisisProtocol ?? {}) as Msgs).message || DEFAULT_CRISIS_MESSAGE;
    await handoff("crise", "possível risco à vida/integridade", msg);
    return;
  }

  // 2) Limite de respostas automáticas por hora (evita laço e custo).
  const recent = await db.aiEvent.count({ where: { conversationId: conv.id, action: "RESPONDEU", createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recent >= MAX_REPLIES_PER_HOUR) {
    await handoff("outro", "limite de respostas automáticas por hora", handoffMsg);
    return;
  }

  // 3) Modelo, com histórico curto.
  const history = await db.waMessage.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: "desc" }, take: 10 });
  const turns: ChatTurn[] = history
    .reverse()
    .filter((m) => m.body)
    .map((m) => ({ role: m.direction === "ENTRADA" ? ("user" as const) : ("assistant" as const), content: decryptField(m.body!) }));

  const raw = await callModel({ system: buildSystemPrompt(conv.clinic.name, cfg.info ?? ""), turns: normalizeTurns(turns) });
  const decision = raw ? parseAiReply(raw) : null;
  if (!decision) {
    await handoff("outro", "falha ou resposta inválida da IA", handoffMsg);
    return;
  }
  if (decision.handoff) {
    await handoff(decision.intent, decision.handoffReason || "encaminhado pela IA", handoffMsg);
    return;
  }
  await say(decision.reply);
  await event(decision.intent, "RESPONDEU");
}
