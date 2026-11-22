import { test } from "node:test";
import assert from "node:assert/strict";
import { hashToken, newLinkToken, normalizeEmail, signPortalSession, validSlug, verifyPortalSession } from "../src/lib/portal-core.ts";

process.env.SESSION_SECRET = "s".repeat(40);

test("endereço do portal: formato e palavras reservadas", () => {
  assert.ok(validSlug("clinica-bem-estar"));
  assert.ok(validSlug("abc"));
  assert.ok(!validSlug("ab"));
  assert.ok(!validSlug("-abc"));
  assert.ok(!validSlug("abc-"));
  assert.ok(!validSlug("Clinica"));
  assert.ok(!validSlug("a b c"));
  assert.ok(!validSlug("admin"));
  assert.ok(!validSlug("api"));
});

test("token de link: aleatório, longo e guardado só como hash", () => {
  const a = newLinkToken();
  const b = newLinkToken();
  assert.notEqual(a.token, b.token);
  assert.ok(a.token.length >= 40);
  assert.equal(a.hash, hashToken(a.token));
  assert.notEqual(a.hash, a.token);
});

test("sessão do portal: válida, expirada e adulterada", () => {
  const t = signPortalSession({ clinicId: "c1", email: "a@b.com", exp: Date.now() + 60_000 });
  assert.equal(verifyPortalSession(t)?.email, "a@b.com");
  assert.equal(verifyPortalSession(signPortalSession({ clinicId: "c1", email: "a@b.com", exp: Date.now() - 1 })), null);
  assert.equal(verifyPortalSession(t.slice(0, -2) + "xx"), null);
  assert.equal(verifyPortalSession("lixo"), null);
});

test("e-mail normalizado", () => {
  assert.equal(normalizeEmail("  Maria@Exemplo.COM "), "maria@exemplo.com");
});
