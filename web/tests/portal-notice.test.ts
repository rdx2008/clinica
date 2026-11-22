import { test } from "node:test";
import assert from "node:assert/strict";
import { noticeSummary, noticeVars, portalUrl } from "../src/lib/portal-notice-core.ts";

test("resumo no singular e no plural, sem conteúdo clínico", () => {
  assert.equal(noticeSummary(["ESCALA"]), "1 questionário");
  assert.equal(noticeSummary(["ESCALA", "ESCALA"]), "2 questionários");
  assert.equal(noticeSummary(["TAREFA", "ESCALA"]), "1 questionário e 1 tarefa");
  assert.equal(noticeSummary(["TAREFA", "ESCALA", "TERMO", "TERMO"]), "2 termos para aceitar, 1 questionário e 1 tarefa");
  assert.equal(noticeSummary([]), "");
});

test("variáveis do modelo na ordem nome, portal, resumo", () => {
  assert.deepEqual(noticeVars("Ana", "https://x.com/p/abc", ["TAREFA"]), ["Ana", "https://x.com/p/abc", "1 tarefa"]);
});

test("endereço do portal", () => {
  assert.equal(portalUrl("https://clinica.com.br/", "triade"), "https://clinica.com.br/p/triade");
  assert.equal(portalUrl("clinica.com.br", "triade"), "https://clinica.com.br/p/triade");
  assert.equal(portalUrl("https://a.com,https://b.com", "x"), "https://a.com/p/x");
  assert.equal(portalUrl(undefined, "x"), null);
  assert.equal(portalUrl("https://a.com", null), null);
});
