import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.SESSION_SECRET = randomBytes(32).toString("hex");

const { encryptField, decryptField, blindIndex } = await import("../src/lib/crypto.ts");
const { hashPassword, verifyPassword } = await import("../src/lib/password.ts");
const { generateTotpSecret, totpAt, verifyTotp } = await import("../src/lib/totp.ts");
const { signToken, verifyToken } = await import("../src/lib/token.ts");

test("criptografia de campo: ida e volta, IV aleatório, adulteração detectada", () => {
  const a = encryptField("123.456.789-09");
  const b = encryptField("123.456.789-09");
  assert.notEqual(a, b);
  assert.equal(decryptField(a), "123.456.789-09");
  const [v, iv, tag, data] = a.split(":");
  const tampered = [v, iv, tag, Buffer.from("xx").toString("base64url") + data].join(":");
  assert.throws(() => decryptField(tampered));
});

test("blindIndex é determinístico e normalizado", () => {
  assert.equal(blindIndex(" ABC "), blindIndex("abc"));
  assert.notEqual(blindIndex("abc"), blindIndex("abd"));
});

test("senha: verifica correta e rejeita errada", async () => {
  const h = await hashPassword("senha-forte-123");
  assert.ok(await verifyPassword("senha-forte-123", h));
  assert.ok(!(await verifyPassword("outra", h)));
  assert.ok(!(await verifyPassword("x", "formato-invalido")));
});

test("TOTP: vetor RFC 6238 e janela de tolerância", () => {
  // Segredo RFC 6238 "12345678901234567890" em base32.
  const rfc = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totpAt(rfc, 59_000, 30, 8), "94287082");
  const s = generateTotpSecret();
  const now = Date.now();
  assert.ok(verifyTotp(s, totpAt(s, now), now));
  assert.ok(verifyTotp(s, totpAt(s, now - 30_000), now));
  assert.ok(!verifyTotp(s, totpAt(s, now - 120_000), now));
  assert.ok(!verifyTotp(s, "abc123", now));
});

test("token de sessão: válido, expirado e adulterado", () => {
  const now = Date.now();
  const t = signToken({ uid: "u1", exp: now + 60_000 });
  assert.equal(verifyToken(t, now)?.uid, "u1");
  assert.equal(verifyToken(t, now + 120_000), null);
  const [d, s] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ uid: "admin", exp: now + 60_000 })).toString("base64url");
  assert.equal(verifyToken(`${forged}.${s}`, now), null);
  assert.equal(verifyToken(`${d}.x`, now), null);
});

test("token de sessão preserva o instante de emissão (iat)", async () => {
  const { signToken, verifyToken } = await import("../src/lib/token.ts");
  process.env.SESSION_SECRET = "x".repeat(40);
  const t = signToken({ uid: "u1", iat: 1000, exp: Date.now() + 60_000 });
  assert.equal(verifyToken(t)?.iat, 1000);
});

test("anexos: criptografia de arquivo ida e volta e detecção de adulteração", async () => {
  process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const { encryptBuffer, decryptBuffer } = await import("../src/lib/crypto.ts");
  const plain = Buffer.from("conteúdo sigiloso do anexo");
  const enc = encryptBuffer(plain);
  assert.ok(!enc.includes(plain));
  assert.deepEqual(decryptBuffer(enc), plain);
  enc[enc.length - 1] ^= 1;
  assert.throws(() => decryptBuffer(enc));
});
