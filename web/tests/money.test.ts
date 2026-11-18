import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveStatus, parseBRL, shiftMonth, validMonth } from "../src/lib/money.ts";

test("valor em reais vira centavos", () => {
  assert.equal(parseBRL("150"), 15000);
  assert.equal(parseBRL("150,5"), 15050);
  assert.equal(parseBRL("1.234,56"), 123456);
  assert.equal(parseBRL("R$ 99,90"), 9990);
  assert.equal(parseBRL("0,01"), 1);
});

test("valores inválidos são rejeitados", () => {
  assert.equal(parseBRL(""), null);
  assert.equal(parseBRL("-10"), null);
  assert.equal(parseBRL("12,345"), null);
  assert.equal(parseBRL("abc"), null);
  assert.equal(parseBRL("1.23"), null);
});

test("status efetivo: pendente vencida", () => {
  assert.equal(effectiveStatus("PENDENTE", "2026-11-10", "2026-11-18"), "VENCIDA");
  assert.equal(effectiveStatus("PENDENTE", "2026-11-18", "2026-11-18"), "PENDENTE");
  assert.equal(effectiveStatus("PAGA", "2026-01-01", "2026-11-18"), "PAGA");
  assert.equal(effectiveStatus("CANCELADA", "2026-01-01", "2026-11-18"), "CANCELADA");
});

test("competência: validação e navegação entre meses", () => {
  assert.ok(validMonth("2026-11"));
  assert.ok(!validMonth("2026-13"));
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});
