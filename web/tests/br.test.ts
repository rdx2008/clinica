import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidCpf, maskCpf, normalizePhoneBR, formatPhoneBR, normalizeName, ageYears } from "../src/lib/br.ts";

test("idade: antes e depois do aniversário", () => {
  const birth = new Date("2000-06-15T00:00:00.000Z");
  assert.equal(ageYears(birth, new Date("2026-06-14T12:00:00.000Z")), 25);
  assert.equal(ageYears(birth, new Date("2026-06-15T12:00:00.000Z")), 26);
  assert.equal(ageYears(birth, new Date("2026-12-31T12:00:00.000Z")), 26);
});

test("CPF: válido, inválido, repetido e com máscara", () => {
  assert.ok(isValidCpf("529.982.247-25"));
  assert.ok(isValidCpf("52998224725"));
  assert.ok(!isValidCpf("529.982.247-24"));
  assert.ok(!isValidCpf("111.111.111-11"));
  assert.ok(!isValidCpf("123"));
});

test("CPF: máscara mostra só os 2 últimos dígitos", () => {
  assert.equal(maskCpf("529.982.247-25"), "***.***.***-25");
});

test("telefone: normaliza para E.164 e rejeita inválidos", () => {
  assert.equal(normalizePhoneBR("(11) 98765-4321"), "+5511987654321");
  assert.equal(normalizePhoneBR("+55 11 98765-4321"), "+5511987654321");
  assert.equal(normalizePhoneBR("11 3456-7890"), "+551134567890");
  assert.equal(normalizePhoneBR("11 88765-4321"), null); // celular sem 9
  assert.equal(normalizePhoneBR("00 98765-4321"), null); // DDD inválido
  assert.equal(normalizePhoneBR("12345"), null);
});

test("telefone: formatação de exibição", () => {
  assert.equal(formatPhoneBR("+5511987654321"), "(11) 98765-4321");
  assert.equal(formatPhoneBR("+551134567890"), "(11) 3456-7890");
});

test("nome: normalização ignora acento, caixa e espaços", () => {
  assert.equal(normalizeName("  José   da  SILVA "), "jose da silva");
});
