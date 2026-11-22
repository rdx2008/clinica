import { test } from "node:test";
import assert from "node:assert/strict";
import { consumeBackupCode, generateBackupCodes, looksLikeBackupCode } from "../src/lib/backup-codes.ts";

test("gera 8 códigos únicos no formato xxxx-xxxx", () => {
  const { codes, hashes } = generateBackupCodes();
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  assert.ok(codes.every((c) => /^[a-z2-9]{4}-[a-z2-9]{4}$/.test(c)));
  assert.equal(hashes.length, 8);
});

test("código de backup é de uso único", () => {
  const { codes, hashes } = generateBackupCodes();
  const after = consumeBackupCode(hashes, codes[0]);
  assert.ok(after);
  assert.equal(after!.length, 7);
  assert.equal(consumeBackupCode(after!, codes[0]), null); // já usado
  assert.ok(consumeBackupCode(after!, codes[1].toUpperCase().replace("-", " "))); // tolera caixa e separador
});

test("código inválido não consome nada", () => {
  const { hashes } = generateBackupCodes();
  assert.equal(consumeBackupCode(hashes, "aaaa-bbbb"), null);
});

test("distingue código de backup de código TOTP", () => {
  assert.ok(looksLikeBackupCode("abcd-2345"));
  assert.ok(!looksLikeBackupCode("123456"));
  assert.ok(!looksLikeBackupCode("12 34 56"));
});
