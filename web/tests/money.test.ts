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

import { shareOf, valorPorExtenso } from "../src/lib/money.ts";
import { toCsv } from "../src/lib/csv.ts";

test("valor por extenso", () => {
  assert.equal(valorPorExtenso(15075), "cento e cinquenta reais e setenta e cinco centavos");
  assert.equal(valorPorExtenso(100), "um real");
  assert.equal(valorPorExtenso(1), "um centavo");
  assert.equal(valorPorExtenso(10000), "cem reais");
  assert.equal(valorPorExtenso(12000), "cento e vinte reais");
  assert.equal(valorPorExtenso(100000), "mil reais");
  assert.equal(valorPorExtenso(123456), "mil, duzentos e trinta e quatro reais e cinquenta e seis centavos");
  assert.equal(valorPorExtenso(200000), "dois mil reais");
  assert.equal(valorPorExtenso(150000), "mil e quinhentos reais");
  assert.equal(valorPorExtenso(0), "zero reais");
});

test("repasse por percentual", () => {
  assert.equal(shareOf(100000, 40), 40000);
  assert.equal(shareOf(33333, 50), 16667);
  assert.equal(shareOf(1000, 150), 1000); // limitado a 100%
  assert.equal(shareOf(1000, -5), 0);
});

test("CSV: separador, aspas e proteção contra fórmulas", () => {
  const out = toCsv(["a", "b"], [["x;y", 'say "hi"'], ["=1+1", 5], [null, "-10"]]);
  assert.ok(out.startsWith("\uFEFF"));
  assert.ok(out.includes('"x;y";"say ""hi"""'));
  assert.ok(out.includes("'=1+1;5"));
  assert.ok(out.includes(";'-10"));
});
