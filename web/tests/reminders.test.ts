import { test } from "node:test";
import assert from "node:assert/strict";
import { reminderState, reminderVars } from "../src/lib/reminders.ts";
import { placeholderCount, renderTemplate } from "../src/lib/whatsapp.ts";

const H = 3600_000;
const start = new Date("2026-11-20T15:00:00Z");

test("lembrete 24h antes: cedo, na hora, atrasado e muito próxima", () => {
  assert.equal(reminderState(start, 1440, new Date(start.getTime() - 25 * H)), "cedo");
  assert.equal(reminderState(start, 1440, new Date(start.getTime() - 24 * H)), "enviar");
  assert.equal(reminderState(start, 1440, new Date(start.getTime() - 20 * H)), "enviar");
  assert.equal(reminderState(start, 1440, new Date(start.getTime() - 10 * H)), "atrasado");
  assert.equal(reminderState(start, 1440, new Date(start.getTime() - 0.5 * H)), "muito_proxima");
});

test("agendamento feito em cima da hora não dispara lembrete tardio", () => {
  // consulta criada 3h antes; lembrete de 24h já "devia" ter saído há 21h
  assert.equal(reminderState(start, 1440, new Date(start.getTime() - 3 * H)), "atrasado");
});

test("variáveis do lembrete", () => {
  assert.deepEqual(reminderVars({ patientName: "  Maria da Silva ", date: "2026-11-20", time: "12:00", professional: "Dra. Ana" }), [
    "Maria",
    "20/11/2026",
    "12:00",
    "Dra. Ana",
  ]);
});

test("modelo: contagem e renderização de variáveis", () => {
  const body = "Olá {{1}}, consulta dia {{2}} às {{3}}.";
  assert.equal(placeholderCount(body), 3);
  assert.equal(placeholderCount("sem variáveis"), 0);
  assert.equal(renderTemplate(body, ["Maria", "20/11", "12:00"]), "Olá Maria, consulta dia 20/11 às 12:00.");
});
