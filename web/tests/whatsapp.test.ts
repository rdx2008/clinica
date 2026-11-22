import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { isStopKeyword, parseConfirmationReply, parseWebhook, verifySignature, waToE164, windowOpen } from "../src/lib/whatsapp.ts";

test("assinatura do webhook: válida, adulterada e ausente", () => {
  const body = '{"a":1}';
  const sig = "sha256=" + createHmac("sha256", "segredo").update(body).digest("hex");
  assert.ok(verifySignature(body, sig, "segredo"));
  assert.ok(!verifySignature('{"a":2}', sig, "segredo"));
  assert.ok(!verifySignature(body, sig, "outro"));
  assert.ok(!verifySignature(body, null, "segredo"));
  assert.ok(!verifySignature(body, "sha256=zz", "segredo"));
  assert.ok(!verifySignature(body, sig, ""));
});

test("parser: mensagem de texto, mídia e status", () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "123" },
              messages: [
                { id: "wamid.1", from: "5511987654321", type: "text", timestamp: "1700000000", text: { body: "Oi" } },
                { id: "wamid.2", from: "5511987654321", type: "audio", timestamp: "1700000001" },
              ],
              statuses: [{ id: "wamid.9", status: "failed", errors: [{ title: "Fora da janela" }] }],
            },
          },
        ],
      },
    ],
  };
  const r = parseWebhook(payload);
  assert.equal(r.messages.length, 2);
  assert.equal(r.messages[0].text, "Oi");
  assert.equal(r.messages[0].phoneNumberId, "123");
  assert.equal(r.messages[1].text, "[áudio recebido]");
  assert.deepEqual(r.statuses, [{ id: "wamid.9", status: "failed", error: "Fora da janela" }]);
});

test("parser: payload inesperado não quebra", () => {
  assert.deepEqual(parseWebhook(null), { messages: [], statuses: [] });
  assert.deepEqual(parseWebhook({ entry: "x" }), { messages: [], statuses: [] });
  assert.deepEqual(parseWebhook({ entry: [{ changes: [{}] }] }), { messages: [], statuses: [] });
});

test("telefone do WhatsApp vira E.164", () => {
  assert.equal(waToE164("5511987654321"), "+5511987654321");
});

test("palavras de descadastro", () => {
  assert.ok(isStopKeyword("SAIR"));
  assert.ok(isStopKeyword("  Parar "));
  assert.ok(!isStopKeyword("Quero sair mais cedo amanhã"));
  assert.ok(!isStopKeyword(null));
});

test("janela de 24h", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  assert.ok(windowOpen(new Date("2026-01-01T13:00:00Z"), now));
  assert.ok(!windowOpen(new Date("2026-01-01T11:00:00Z"), now));
  assert.ok(!windowOpen(null, now));
});

test("resposta ao lembrete: confirma, cancela e ignora conversa normal", () => {
  assert.equal(parseConfirmationReply("1"), "CONFIRMA");
  assert.equal(parseConfirmationReply(" Sim! "), "CONFIRMA");
  assert.equal(parseConfirmationReply("Confirmo."), "CONFIRMA");
  assert.equal(parseConfirmationReply("2"), "CANCELA");
  assert.equal(parseConfirmationReply("Não posso"), "CANCELA");
  assert.equal(parseConfirmationReply("Preciso remarcar"), "CANCELA");
  assert.equal(parseConfirmationReply("Sim, mas qual o endereço?"), null);
  assert.equal(parseConfirmationReply("Oi, tudo bem?"), null);
  assert.equal(parseConfirmationReply(null), null);
});
