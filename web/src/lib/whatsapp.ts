// WhatsApp Cloud API: funções puras (assinatura, parser) e envio. Sem dependências internas.
import { createHmac, timingSafeEqual } from "node:crypto";

export const GRAPH_VERSION = "v21.0";
export const WINDOW_MS = 24 * 3600_000;

// Valida X-Hub-Signature-256 ("sha256=<hex>") sobre o corpo bruto.
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  let given: Buffer;
  try {
    given = Buffer.from(header.slice(7), "hex");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type InboundMessage = { phoneNumberId: string; from: string; id: string; type: string; text: string | null; at: Date };
export type StatusUpdate = { id: string; status: string; error: string | null };

const PLACEHOLDER: Record<string, string> = {
  image: "[imagem recebida]",
  audio: "[áudio recebido]",
  video: "[vídeo recebido]",
  document: "[documento recebido]",
  sticker: "[figurinha recebida]",
  location: "[localização recebida]",
  contacts: "[contato recebido]",
};

// Extrai mensagens e atualizações de status do payload do webhook. Tolerante a formatos inesperados.
export function parseWebhook(payload: unknown): { messages: InboundMessage[]; statuses: StatusUpdate[] } {
  const messages: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];
  const entries = (payload as { entry?: unknown[] } | null)?.entry;
  if (!Array.isArray(entries)) return { messages, statuses };

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value;
      if (!value) continue;
      const phoneNumberId = String((value.metadata as { phone_number_id?: string } | undefined)?.phone_number_id ?? "");

      for (const m of (Array.isArray(value.messages) ? value.messages : []) as Record<string, unknown>[]) {
        if (!m.id || !m.from || !phoneNumberId) continue;
        const type = String(m.type ?? "text");
        const body = type === "text" ? ((m.text as { body?: string } | undefined)?.body ?? null) : (PLACEHOLDER[type] ?? `[${type}]`);
        const ts = Number(m.timestamp);
        messages.push({
          phoneNumberId,
          from: String(m.from),
          id: String(m.id),
          type,
          text: body,
          at: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : new Date(),
        });
      }
      for (const s of (Array.isArray(value.statuses) ? value.statuses : []) as Record<string, unknown>[]) {
        if (!s.id || !s.status) continue;
        const err = (s.errors as { title?: string }[] | undefined)?.[0]?.title ?? null;
        statuses.push({ id: String(s.id), status: String(s.status), error: err });
      }
    }
  }
  return { messages, statuses };
}

// "5511987654321" (formato do WhatsApp, sem +) -> "+5511987654321"
export function waToE164(wa: string): string {
  return `+${wa.replace(/\D/g, "")}`;
}

// Palavras que significam "não quero mais receber mensagens".
export function isStopKeyword(text: string | null): boolean {
  if (!text) return false;
  const t = text.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  return ["sair", "parar", "stop", "cancelar mensagens", "nao quero receber"].includes(t);
}

export function windowOpen(expiresAt: Date | null, now: Date = new Date()): boolean {
  return !!expiresAt && expiresAt > now;
}

// Quantidade de variáveis {{1}}, {{2}}... do corpo do modelo (maior índice usado).
export function placeholderCount(body: string): number {
  let max = 0;
  for (const m of body.matchAll(/\{\{(\d+)\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

export function renderTemplate(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");
}

// Envia mensagem modelo (única forma de iniciar conversa fora da janela de 24h).
export async function sendTemplate(params: {
  token: string;
  phoneNumberId: string;
  to: string;
  name: string;
  language: string;
  vars: string[];
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${params.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${params.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: params.to.replace(/\D/g, ""),
        type: "template",
        template: {
          name: params.name,
          language: { code: params.language },
          ...(params.vars.length
            ? { components: [{ type: "body", parameters: params.vars.map((text) => ({ type: "text", text })) }] }
            : {}),
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!res.ok || !json.messages?.[0]?.id) return { ok: false, error: json.error?.message ?? `Erro ${res.status} da API do WhatsApp` };
    return { ok: true, id: json.messages[0].id };
  } catch {
    return { ok: false, error: "Não foi possível falar com o WhatsApp." };
  }
}

// Envia texto livre (só permitido dentro da janela de 24h). Devolve o id da mensagem na Meta.
export async function sendText(params: { token: string; phoneNumberId: string; to: string; body: string }): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${params.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${params.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: params.to.replace(/\D/g, ""),
        type: "text",
        text: { body: params.body, preview_url: false },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!res.ok || !json.messages?.[0]?.id) return { ok: false, error: json.error?.message ?? `Erro ${res.status} da API do WhatsApp` };
    return { ok: true, id: json.messages[0].id };
  } catch {
    return { ok: false, error: "Não foi possível falar com o WhatsApp. Tente novamente." };
  }
}
