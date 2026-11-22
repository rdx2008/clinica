import { test } from "node:test";
import assert from "node:assert/strict";
import { isScaleKey, SCALES, scoreScale, trend } from "../src/lib/scales.ts";
import { fillTerm, TERM_TEMPLATES } from "../src/lib/terms-templates.ts";

test("PHQ-9: pontuação máxima e faixas de gravidade", () => {
  assert.equal(SCALES.PHQ9.items.length, 9);
  assert.equal(scoreScale("PHQ9", Array(9).fill(0))?.severity, "Sintomas mínimos");
  assert.equal(scoreScale("PHQ9", [1, 1, 1, 1, 1, 0, 0, 0, 0])?.severity, "Sintomas leves"); // 5
  assert.equal(scoreScale("PHQ9", [2, 2, 2, 2, 2, 0, 0, 0, 0])?.severity, "Sintomas moderados"); // 10
  assert.equal(scoreScale("PHQ9", [2, 2, 2, 2, 2, 2, 2, 2, 0])?.score, 16);
  assert.equal(scoreScale("PHQ9", [2, 2, 2, 2, 2, 2, 2, 2, 0])?.severity, "Sintomas moderadamente graves");
  const max = scoreScale("PHQ9", Array(9).fill(3));
  assert.equal(max?.score, 27);
  assert.equal(max?.severity, "Sintomas graves");
});

test("PHQ-9: item 9 acima de zero sinaliza risco, mesmo com pontuação baixa", () => {
  assert.equal(scoreScale("PHQ9", [0, 0, 0, 0, 0, 0, 0, 0, 1])?.risk, true);
  assert.equal(scoreScale("PHQ9", [3, 3, 3, 3, 3, 3, 3, 3, 0])?.risk, false);
});

test("GAD-7: faixas e ausência de item de risco", () => {
  assert.equal(SCALES.GAD7.items.length, 7);
  assert.equal(scoreScale("GAD7", Array(7).fill(0))?.severity, "Ansiedade mínima");
  assert.equal(scoreScale("GAD7", Array(7).fill(1))?.score, 7);
  assert.equal(scoreScale("GAD7", Array(7).fill(1))?.severity, "Ansiedade leve");
  assert.equal(scoreScale("GAD7", Array(7).fill(2))?.severity, "Ansiedade moderada"); // 14
  assert.equal(scoreScale("GAD7", Array(7).fill(3))?.severity, "Ansiedade grave"); // 21
  assert.equal(scoreScale("GAD7", Array(7).fill(3))?.risk, false);
});

test("respostas inválidas são recusadas", () => {
  assert.equal(scoreScale("PHQ9", Array(8).fill(0)), null);
  assert.equal(scoreScale("PHQ9", [0, 0, 0, 0, 0, 0, 0, 0, 4]), null);
  assert.equal(scoreScale("PHQ9", [0, 0, 0, 0, 0, 0, 0, 0, -1]), null);
  assert.equal(scoreScale("GAD7", Array(7).fill(1.5)), null);
  assert.equal(scoreScale("GAD7", "abc"), null);
});

test("tendência entre aplicações", () => {
  assert.equal(trend(null, 10), null);
  assert.equal(trend(12, 6)?.label, "melhora");
  assert.equal(trend(6, 12)?.label, "piora");
  assert.equal(trend(10, 11)?.label, "estável");
});

test("chaves de escala e modelos de termo", () => {
  assert.ok(isScaleKey("PHQ9") && isScaleKey("GAD7"));
  assert.ok(!isScaleKey("BDI"));
  assert.ok(TERM_TEMPLATES.length >= 2);
  const t = fillTerm(TERM_TEMPLATES[0].body, { clinica: "Clínica X", cnpj: " — CNPJ 1" });
  assert.ok(t.includes("Clínica X — CNPJ 1"));
  assert.ok(!t.includes("{clinica}"));
});
