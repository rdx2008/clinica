// Validação de arquivos enviados (anexos do prontuário). Sem dependências internas.

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_ATTACHMENTS_PER_RECORD = 20;

export type SniffedType = { mime: string; ext: string; inline: boolean };

function startsWith(buf: Uint8Array, bytes: number[], offset = 0): boolean {
  return bytes.every((b, i) => buf[offset + i] === b);
}

// Descobre o tipo pelo conteúdo (não confia no nome nem no tipo informado pelo navegador).
// Só aceita PDF, imagens e áudio: tudo o mais é recusado (evita HTML/scripts e executáveis).
export function sniffType(buf: Uint8Array): SniffedType | null {
  if (buf.length < 12) return null;
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: "application/pdf", ext: "pdf", inline: true }; // %PDF-
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png", inline: true };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg", inline: true };
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: "image/webp", ext: "webp", inline: true }; // RIFF....WEBP
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x41, 0x56, 0x45], 8)) return { mime: "audio/wav", ext: "wav", inline: true }; // RIFF....WAVE
  if (startsWith(buf, [0x4f, 0x67, 0x67, 0x53])) return { mime: "audio/ogg", ext: "ogg", inline: true }; // OggS
  if (startsWith(buf, [0x49, 0x44, 0x33]) || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { mime: "audio/mpeg", ext: "mp3", inline: true }; // ID3 / frame sync
  if (startsWith(buf, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]);
    if (brand.startsWith("M4A") || brand === "mp42" || brand === "isom") return { mime: "audio/mp4", ext: "m4a", inline: true };
  }
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: "audio/webm", ext: "webm", inline: true }; // EBML (webm gravado no navegador)
  return null;
}

// Nome seguro para exibição e download: sem caminhos, sem caracteres de controle, tamanho limitado.
export function safeFileName(name: string, ext: string): string {
  const base = name
    .replace(/[\\/]/g, " ")
    .replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "")
    .replace(/\.[a-zA-Z0-9]{1,5}$/, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+/, "")
    .trim()
    .slice(0, 80);
  return `${base || "arquivo"}.${ext}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
