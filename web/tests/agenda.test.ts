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

import { localWeekday, withinAvailability } from "../src/lib/agenda.ts";

test("disponibilidade semanal: dentro, fora e sem janelas", () => {
  // 2026-11-18 é quarta-feira (3)
  const s = parseLocal("2026-11-18", "09:00")!;
  const e = parseLocal("2026-11-18", "09:50")!;
  assert.equal(localWeekday(s), 3);
  const wins = [{ weekday: 3, startTime: "08:00", endTime: "12:00" }];
  assert.ok(withinAvailability(s, e, wins));
  assert.ok(withinAvailability(s, e, [])); // sem janelas: livre
  assert.ok(!withinAvailability(parseLocal("2026-11-18", "11:30")!, parseLocal("2026-11-18", "12:20")!, wins)); // passa do fim
  assert.ok(!withinAvailability(parseLocal("2026-11-19", "09:00")!, parseLocal("2026-11-19", "09:50")!, wins)); // outro dia
});

import { layoutLanes, minutesOfDay, weekDays, weekStart } from "../src/lib/agenda.ts";

test("semana começa na segunda e tem 7 dias", () => {
  // 2026-11-18 é quarta; a segunda é 2026-11-16
  assert.equal(weekStart("2026-11-18"), "2026-11-16");
  assert.equal(weekStart("2026-11-16"), "2026-11-16");
  assert.equal(weekStart("2026-11-22"), "2026-11-16"); // domingo pertence à semana que começou na segunda anterior
  assert.deepEqual(weekDays("2026-11-18"), ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
});

test("minutos do dia no fuso da clínica", () => {
  assert.equal(minutesOfDay(parseLocal("2026-11-18", "14:30")!), 14 * 60 + 30);
  assert.equal(minutesOfDay(parseLocal("2026-11-18", "00:05")!), 5);
});

test("faixas: eventos sobrepostos ficam lado a lado, os demais usam largura total", () => {
  const m = layoutLanes([
    { id: "a", start: 540, end: 600 },
    { id: "b", start: 570, end: 630 },
    { id: "c", start: 700, end: 760 },
  ]);
  assert.deepEqual(m.get("a"), { lane: 0, lanes: 2 });
  assert.deepEqual(m.get("b"), { lane: 1, lanes: 2 });
  assert.deepEqual(m.get("c"), { lane: 0, lanes: 1 });
});

test("faixas: reaproveita faixa livre", () => {
  const m = layoutLanes([
    { id: "a", start: 540, end: 660 },
    { id: "b", start: 540, end: 570 },
    { id: "c", start: 580, end: 640 },
  ]);
  assert.equal(m.get("a")!.lanes, 2);
  assert.equal(m.get("c")!.lane, 1); // ocupa a faixa que "b" liberou
});
