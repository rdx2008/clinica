import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBytes, safeFileName, sniffType } from "../src/lib/files.ts";

const pad = (b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);

test("reconhece PDF, PNG, JPEG, WEBP e áudios pelo conteúdo", () => {
  assert.equal(sniffType(pad([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))?.mime, "application/pdf");
  assert.equal(sniffType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime, "image/png");
  assert.equal(sniffType(pad([0xff, 0xd8, 0xff, 0xe0]))?.mime, "image/jpeg");
  assert.equal(sniffType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]))?.mime, "image/webp");
  assert.equal(sniffType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 0, 0, 0, 0]))?.mime, "audio/wav");
  assert.equal(sniffType(pad([0x4f, 0x67, 0x67, 0x53]))?.mime, "audio/ogg");
  assert.equal(sniffType(pad([0x49, 0x44, 0x33, 4]))?.mime, "audio/mpeg");
  assert.equal(sniffType(new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20, 0, 0, 0, 0]))?.mime, "audio/mp4");
  assert.equal(sniffType(pad([0x1a, 0x45, 0xdf, 0xa3]))?.mime, "audio/webm");
});

test("recusa HTML, scripts, executáveis e arquivos pequenos", () => {
  const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
  assert.equal(sniffType(html), null);
  assert.equal(sniffType(pad([0x4d, 0x5a, 0x90, 0x00])), null); // MZ (exe)
  assert.equal(sniffType(new Uint8Array([0x25, 0x50])), null);
});

test("nome de arquivo seguro", () => {
  assert.equal(safeFileName("../../etc/passwd.pdf", "pdf"), "etc passwd.pdf");
  assert.equal(safeFileName('rel"atório<1>.png', "pdf"), "relatório1.pdf");
  assert.equal(safeFileName("", "jpg"), "arquivo.jpg");
  assert.ok(safeFileName("a".repeat(300), "pdf").length <= 84);
});

test("tamanho legível", () => {
  assert.equal(formatBytes(500), "500 B");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
});
