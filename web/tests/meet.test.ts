import { test } from "node:test";
import assert from "node:assert/strict";
import { isMeetCode, meetCode, nearestTo } from "../src/lib/meet-core.ts";

test("código do Meet a partir do endereço", () => {
  assert.equal(meetCode("https://meet.google.com/abc-defg-hij"), "abc-defg-hij");
  assert.equal(meetCode("https://meet.google.com/ABC-defg-hij?authuser=1"), "abc-defg-hij");
  assert.equal(meetCode("meet.google.com/abc-defg-hij"), "abc-defg-hij");
  assert.equal(meetCode("https://meet.google.com/lookup/abc"), null);
  assert.equal(meetCode("https://meet.google.com/"), null);
  assert.equal(meetCode("https://zoom.us/j/123"), null);
  assert.equal(meetCode("https://evil.com/meet.google.com/abc-defg-hij"), null);
  assert.equal(meetCode(null), null);
  assert.equal(meetCode("não é endereço"), null);
});

test("validação do código", () => {
  assert.ok(isMeetCode("abc-defg-hij"));
  assert.ok(!isMeetCode("abcdefghij"));
  assert.ok(!isMeetCode("abc-defg-hij'; drop"));
  assert.ok(!isMeetCode("ABC-defg-hij"));
});

test("consulta mais próxima de agora", () => {
  const now = new Date("2026-11-23T13:00:00Z");
  const a = { id: "a", startsAt: new Date("2026-11-20T13:00:00Z") };
  const b = { id: "b", startsAt: new Date("2026-11-23T12:30:00Z") };
  const c = { id: "c", startsAt: new Date("2026-11-30T13:00:00Z") };
  assert.equal(nearestTo([a, b, c], now)?.id, "b");
  assert.equal(nearestTo([], now), null);
});
