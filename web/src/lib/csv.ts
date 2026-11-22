// CSV simples e seguro: delimitador automático (; , tab), aspas, quebras de linha CRLF e BOM.
// Sem dependências internas (testável isoladamente).

export type Csv = { headers: string[]; rows: string[][] };

function detectDelimiter(firstLine: string): string {
  const counts = [";", ",", "\t"].map((d) => [d, firstLine.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

export function parseCsv(text: string): Csv {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = detectDelimiter(firstLine);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);

  const [headers = [], ...data] = rows;
  return { headers: headers.map((h) => h.trim()), rows: data };
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type PatientColumn = "nome" | "telefone" | "email" | "nascimento" | "cpf" | "origem" | "etiquetas";

const ALIASES: Record<PatientColumn, string[]> = {
  nome: ["nome", "nome completo", "paciente", "name", "cliente"],
  telefone: ["telefone", "celular", "whatsapp", "fone", "phone", "tel"],
  email: ["email", "e mail", "mail"],
  nascimento: ["nascimento", "data de nascimento", "data nascimento", "data nasc", "dt nasc", "birth", "birthdate"],
  cpf: ["cpf"],
  origem: ["origem", "como conheceu", "fonte"],
  etiquetas: ["etiquetas", "tags", "etiqueta"],
};

// Mapeia cada coluna da planilha para um campo conhecido (ou ignora).
export function mapHeaders(headers: string[]): Partial<Record<PatientColumn, number>> {
  const map: Partial<Record<PatientColumn, number>> = {};
  headers.forEach((h, i) => {
    const f = fold(h);
    for (const [col, names] of Object.entries(ALIASES) as [PatientColumn, string[]][]) {
      if (map[col] === undefined && names.includes(f)) map[col] = i;
    }
  });
  return map;
}

// "25/12/1990" ou "1990-12-25" -> "1990-12-25"; null se inválida.
export function parseDateFlexible(s: string): string | null {
  const t = s.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (match) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 1900) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
