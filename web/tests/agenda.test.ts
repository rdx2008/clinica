import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, dayRange, localDate, localTime, overlaps, parseLocal, validMeetingUrl, weeklyOccurrences } from "../src/lib/agenda.ts";

test("horário local de Brasília vira UTC (+3h) e volta", () => {
  const d = parseLocal("2026-11-18", "14:30")!;
  assert.equal(d.toISOString(), "2026-11-18T17:30:00.000Z");
  assert.equal(localDate(d), "2026-11-18");
  assert.equal(localTime(d), "14:30");
});

test("22h local ainda é o mesmo dia local (01h UTC do dia seguinte)", () => {
  const d = parseLocal("2026-11-18", "22:30")!;
  assert.equal(d.toISOString(), "2026-11-19T01:30:00.000Z");
  assert.equal(localDate(d), "2026-11-18");
});

test("entradas inválidas retornam null", () => {
  assert.equal(parseLocal("18/11/2026", "14:30"), null);
  assert.equal(parseLocal("2026-11-18", "25:00"), null);
  assert.equal(dayRange("x"), null);
});

test("intervalo do dia tem 24h", () => {
  const r = dayRange("2026-11-18")!;
  assert.equal(r.end.getTime() - r.start.getTime(), 24 * 3600_000);
});

test("addDays atravessa mês e ano", () => {
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
});

test("sobreposição: encostar não conflita, invadir conflita", () => {
  const t = (h: number) => new Date(Date.UTC(2026, 0, 1, h));
  assert.equal(overlaps(t(10), t(11), t(11), t(12)), false);
  assert.equal(overlaps(t(10), t(11), t(10), t(11)), true);
  assert.equal(overlaps(t(10), t(12), t(11), t(13)), true);
  assert.equal(overlaps(t(10), t(14), t(11), t(12)), true);
});

test("recorrência semanal: N ocorrências a cada 7 dias, limitada a 52", () => {
  const s = parseLocal("2026-11-18", "10:00")!;
  const e = parseLocal("2026-11-18", "10:50")!;
  const occ = weeklyOccurrences(s, e, 3);
  assert.equal(occ.length, 3);
  assert.equal(localDate(occ[2].startsAt), "2026-12-02");
  assert.equal(weeklyOccurrences(s, e, 999).length, 52);
  assert.equal(weeklyOccurrences(s, e, 0).length, 1);
});

test("link de reunião aceita só http(s)", () => {
  assert.ok(validMeetingUrl("https://meet.google.com/abc-defg-hij"));
  assert.ok(!validMeetingUrl("javascript:alert(1)"));
  assert.ok(!validMeetingUrl("meet.google.com/abc"));
});
