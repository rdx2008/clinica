import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectPdfSignatures } from "../src/lib/pdf-signature.ts";

// PDF sintético com um espaço de assinatura contendo um certificado de teste (gerado só para este teste).
const CERT_HEX = readFileSync(new URL("./fixtures/cert-teste.hex", import.meta.url), "utf8").trim();

function signedPdf(trailer = ""): Buffer {
  const pad = (n: number) => String(n).padStart(10, "0");
  const hex = CERT_HEX + "0".repeat(2000);
  const head = "%PDF-1.7\n1 0 obj\n<< /Type /Sig /ByteRange [0 " + pad(0) + " " + pad(0) + " " + pad(0) + "] /Contents ";
  const gap = `<${hex}>`;
  const tail = "\n>>\nendobj\n%%EOF\n";
  const gapStart = head.length;
  const gapEnd = gapStart + gap.length;
  const filled = head.replace("[0 " + pad(0) + " " + pad(0) + " " + pad(0) + "]", `[0 ${pad(gapStart)} ${pad(gapEnd)} ${pad(tail.length)}]`);
  return Buffer.from(filled + gap + tail + trailer, "latin1");
}

test("lê o signatário, o emissor e a validade da assinatura", () => {
  const r = inspectPdfSignatures(signedPdf());
  assert.equal(r.count, 1);
  const s = r.signatures[0];
  assert.equal(s.signer, "MARIA PSICOLOGA TESTE"); // sem o CPF no fim do nome
  assert.equal(s.icpBrasil, true);
  assert.ok(s.notBefore && s.notAfter && s.notAfter > s.notBefore);
  assert.equal(s.coversEnd, true);
  assert.equal(r.intact, true);
});

test("conteúdo acrescentado depois da assinatura é apontado", () => {
  const r = inspectPdfSignatures(signedPdf("\n% acrescentado depois de assinar\n"));
  assert.equal(r.count, 1);
  assert.equal(r.signatures[0].coversEnd, false);
  assert.equal(r.intact, false);
});

test("PDF sem assinatura", () => {
  const r = inspectPdfSignatures(Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n", "latin1"));
  assert.equal(r.count, 0);
  assert.equal(r.intact, false);
});

test("intervalo de assinatura inconsistente é ignorado", () => {
  const r = inspectPdfSignatures(Buffer.from("%PDF-1.7\n/ByteRange [0 5 9999 20] /Contents <abcd>\n", "latin1"));
  assert.equal(r.count, 0);
});
