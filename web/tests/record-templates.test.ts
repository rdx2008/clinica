import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TEMPLATES, fillTemplate } from "../src/lib/record-templates.ts";

test("variáveis conhecidas são preenchidas; desconhecidas e vazias ficam", () => {
  const out = fillTemplate("Olá {paciente}, em {data}. {extra} {registro}", { paciente: "Maria", data: "20/11/2026", registro: "" });
  assert.equal(out, "Olá Maria, em 20/11/2026. {extra} {registro}");
});

test("modelos padrão: tipos válidos e conteúdo não vazio", () => {
  const types = ["ANAMNESE", "DEMANDA", "EVOLUCAO", "ENCAMINHAMENTO", "ENCERRAMENTO", "DOCUMENTO", "ANOTACAO_PESSOAL"];
  assert.ok(DEFAULT_TEMPLATES.length >= 6);
  for (const t of DEFAULT_TEMPLATES) {
    assert.ok(types.includes(t.type), t.name);
    assert.ok(t.content.trim().length > 20, t.name);
  }
  assert.ok(DEFAULT_TEMPLATES.some((t) => t.type === "DOCUMENTO"));
});
