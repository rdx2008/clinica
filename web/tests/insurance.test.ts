import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAuth, expectedPayDate, payoutShare } from "../src/lib/insurance-core.ts";

test("previsão de pagamento soma o prazo do convênio", () => {
  assert.equal(expectedPayDate("2026-11-20", 30).toISOString().slice(0, 10), "2026-12-20");
  assert.equal(expectedPayDate("2026-12-20", 45).toISOString().slice(0, 10), "2027-02-03");
  assert.equal(expectedPayDate("2026-11-20", 0).toISOString().slice(0, 10), "2026-11-20");
});

test("autorização: sessões e validade", () => {
  const on = new Date("2026-11-22T00:00:00Z");
  assert.deepEqual(checkAuth({ sessionsTotal: 10, validUntil: null }, 3, on), { ok: true, remaining: 7 });
  assert.equal(checkAuth({ sessionsTotal: 10, validUntil: null }, 10, on).ok, false);
  assert.equal(checkAuth({ sessionsTotal: 10, validUntil: new Date("2026-11-01T00:00:00Z") }, 0, on).ok, false);
  assert.equal(checkAuth({ sessionsTotal: 10, validUntil: new Date("2026-11-22T00:00:00Z") }, 0, on).ok, true);
});

test("repasse: particular e convênio com percentuais diferentes", () => {
  // profissional 50%: particular 100,00 -> 50,00; convênio A (sem %) 200,00 -> 100,00; convênio B 40% 100,00 -> 40,00
  const r = payoutShare(10000, 50, [
    { percent: null, cents: 20000 },
    { percent: 40, cents: 10000 },
  ]);
  assert.equal(r.grossCents, 40000);
  assert.equal(r.shareCents, 5000 + 10000 + 4000);
});

test("repasse sem convênio mantém o cálculo atual", () => {
  assert.deepEqual(payoutShare(12345, 33, []), { grossCents: 12345, shareCents: Math.round((12345 * 33) / 100) });
});
