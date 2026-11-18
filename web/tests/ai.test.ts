import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt, detectCrisis, normalizeTurns, parseAiReply } from "../src/lib/ai.ts";

test("crise: detecta frases de risco, com ou sem acento e caixa", () => {
  assert.ok(detectCrisis("Eu quero me matar"));
  assert.ok(detectCrisis("não aguento mais, quero MORRER"));
  assert.ok(detectCrisis("tenho pensado em suicídio"));
  assert.ok(detectCrisis("Não quero mais viver"));
});

test("crise: mensagens comuns não disparam", () => {
  assert.ok(!detectCrisis("Qual o valor da consulta?"));
  assert.ok(!detectCrisis("Preciso remarcar para amanhã às 10h"));
  assert.ok(!detectCrisis("Vocês atendem aos sábados?"));
});

test("resposta do modelo: JSON válido e extração de texto ao redor", () => {
  const d = parseAiReply('Claro! {"reply":"Atendemos de seg a sex, 8h às 18h.","intent":"informacao","handoff":false,"handoffReason":""}');
  assert.deepEqual(d, { reply: "Atendemos de seg a sex, 8h às 18h.", intent: "informacao", handoff: false, handoffReason: "" });
});

test("resposta do modelo: clínico e agendamento sempre vão para humano", () => {
  assert.equal(parseAiReply('{"reply":"ok","intent":"clinico","handoff":false}')?.handoff, true);
  assert.equal(parseAiReply('{"reply":"ok","intent":"agendamento","handoff":false}')?.handoff, true);
});

test("resposta do modelo: formato inválido vira null", () => {
  assert.equal(parseAiReply("sem json"), null);
  assert.equal(parseAiReply('{"reply":"x"}'), null);
  assert.equal(parseAiReply('{"reply":"","handoff":false}'), null);
  assert.equal(parseAiReply(`{"reply":"${"a".repeat(1001)}","handoff":false}`), null);
});

test("histórico: junta papéis repetidos e começa por usuário", () => {
  const t = normalizeTurns([
    { role: "assistant", content: "oi" },
    { role: "user", content: "a" },
    { role: "user", content: "b" },
    { role: "assistant", content: "c" },
  ]);
  assert.deepEqual(t, [
    { role: "user", content: "a\nb" },
    { role: "assistant", content: "c" },
  ]);
});

test("prompt contém as regras e o conteúdo aprovado", () => {
  const p = buildSystemPrompt("Clínica Teste", "Horário: seg a sex 8h-18h");
  assert.ok(p.includes("Clínica Teste"));
  assert.ok(p.includes("seg a sex 8h-18h"));
  assert.ok(p.includes("Nunca dê orientação clínica"));
});
