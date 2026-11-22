import { X509Certificate } from "node:crypto";

// Leitura das assinaturas digitais de um PDF (PAdES / ICP-Brasil / gov.br), só com o que o Node já traz.
// O que ele faz: acha cada assinatura, lê o certificado do signatário (nome, emissor, validade) e confere
// se a assinatura cobre o arquivo até o fim (nenhum conteúdo acrescentado depois).
// O que NÃO faz: validar a cadeia de confiança nem a integridade criptográfica. Para isso existe o
// validador oficial do ITI (validar.iti.gov.br). O sistema informa isso na tela.

export type PdfSignature = {
  signer: string | null;
  issuer: string | null;
  notBefore: string | null; // ISO
  notAfter: string | null; // ISO
  icpBrasil: boolean;
  coversEnd: boolean; // a assinatura cobre o arquivo até o final
};

export type PdfSignatureReport = {
  count: number;
  signatures: PdfSignature[];
  intact: boolean; // a última assinatura cobre o arquivo todo
};

const BYTE_RANGE = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;

function dnValue(dn: string, key: string): string | null {
  for (const line of dn.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && line.slice(0, i).trim().toUpperCase() === key) return line.slice(i + 1).trim() || null;
  }
  return null;
}

// ICP-Brasil grava o CPF/CNPJ no fim do nome ("FULANO DE TAL:12345678900"). Não guardamos esse número.
function cleanName(s: string | null): string | null {
  if (!s) return null;
  return s.replace(/:\d{11,14}$/, "").trim() || null;
}

// Procura certificados X.509 (DER) dentro do bloco PKCS#7 da assinatura.
function certificatesIn(der: Buffer): X509Certificate[] {
  const out: X509Certificate[] = [];
  for (let i = 0; i + 4 < der.length; i++) {
    if (der[i] !== 0x30 || der[i + 1] !== 0x82) continue;
    const len = 4 + ((der[i + 2] << 8) | der[i + 3]);
    if (len < 200 || i + len > der.length) continue;
    try {
      out.push(new X509Certificate(der.subarray(i, i + len)));
      i += len - 1;
    } catch {
      // Não era um certificado; segue procurando.
    }
  }
  return out;
}

export function inspectPdfSignatures(buf: Buffer): PdfSignatureReport {
  const text = buf.toString("latin1");
  const signatures: PdfSignature[] = [];

  for (const m of text.matchAll(BYTE_RANGE)) {
    const [, a0, a1, a2, a3] = m;
    const start = Number(a0);
    const gapStart = Number(a1);
    const gapEnd = Number(a2);
    const tail = Number(a3);
    if (start !== 0 || gapEnd <= gapStart + 2 || gapEnd + tail > buf.length + 2) continue;
    // O intervalo entre os dois trechos assinados guarda a assinatura em hexadecimal: <...>
    if (buf[gapStart] !== 0x3c || buf[gapEnd - 1] !== 0x3e) continue;
    const hex = buf.subarray(gapStart + 1, gapEnd - 1).toString("latin1").replace(/\s+/g, "").replace(/(00)+$/, "");
    if (hex.length < 40 || /[^0-9a-fA-F]/.test(hex) || hex.length % 2 !== 0) continue;

    const certs = certificatesIn(Buffer.from(hex, "hex"));
    const leaf = certs.find((c) => !c.ca) ?? certs[0] ?? null;
    const issuerDn = leaf?.issuer ?? "";
    signatures.push({
      signer: leaf ? cleanName(dnValue(leaf.subject, "CN")) : null,
      issuer: leaf ? (dnValue(issuerDn, "CN") ?? dnValue(issuerDn, "O")) : null,
      notBefore: leaf ? new Date(leaf.validFrom).toISOString() : null,
      notAfter: leaf ? new Date(leaf.validTo).toISOString() : null,
      icpBrasil: leaf ? /icp-?brasil/i.test(`${leaf.issuer}\n${leaf.subject}`) : false,
      coversEnd: buf.length - (gapEnd + tail) <= 2,
    });
  }

  return { count: signatures.length, signatures, intact: signatures.length > 0 && signatures[signatures.length - 1].coversEnd };
}
