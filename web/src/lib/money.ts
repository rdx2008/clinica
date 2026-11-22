// Valores em centavos (inteiros) para evitar erro de ponto flutuante.

// "1.234,56" | "150" | "150,5" | "R$ 99,90" -> centavos. Null se inválido ou negativo.
export function parseBRL(input: string): number | null {
  const s = input.replace(/[R$\s]/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return null;
  const [int, dec = ""] = s.replace(/\./g, "").split(",");
  const cents = Number(int) * 100 + Number(dec.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export type EffectiveStatus = "PENDENTE" | "PAGA" | "VENCIDA" | "CANCELADA";

// VENCIDA não é gravada: é uma cobrança pendente cujo vencimento (AAAA-MM-DD) já passou.
export function effectiveStatus(status: string, dueDate: string, today: string): EffectiveStatus {
  if (status === "PENDENTE" && dueDate < today) return "VENCIDA";
  return status as EffectiveStatus;
}

export function validMonth(m: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
}

export function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---- Valor por extenso (recibos): 15075 -> "cento e cinquenta reais e setenta e cinco centavos" ----

const UN = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CEN = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (c) parts.push(CEN[c]);
  if (r) parts.push(r < 20 ? UN[r] : DEZ[Math.floor(r / 10)] + (r % 10 ? ` e ${UN[r % 10]}` : ""));
  return parts.join(" e ");
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const parts: string[] = [];
  if (milhoes) parts.push(milhoes === 1 ? "um milhão" : `${ate999(milhoes)} milhões`);
  if (milhares) parts.push(milhares === 1 ? "mil" : `${ate999(milhares)} mil`);
  if (resto) parts.push(ate999(resto));
  // "e" antes do último bloco quando ele é < 100 ou múltiplo de 100 (regra usual)
  if (parts.length > 1) {
    const last = parts.pop()!;
    const lastN = resto || milhares;
    const useE = lastN < 100 || lastN % 100 === 0;
    return parts.join(", ") + (useE ? " e " : ", ") + last;
  }
  return parts[0];
}

export function valorPorExtenso(cents: number): string {
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  const r = reais === 1 ? "um real" : `${inteiroPorExtenso(reais)} ${reais !== 0 && reais % 1_000_000 === 0 ? "de reais" : "reais"}`;
  if (centavos === 0) return reais === 0 ? "zero reais" : r;
  const c = centavos === 1 ? "um centavo" : `${inteiroPorExtenso(centavos)} centavos`;
  return reais === 0 ? c : `${r} e ${c}`;
}

// Repasse = percentual sobre o valor recebido (arredondado ao centavo).
export function shareOf(grossCents: number, percent: number): number {
  return Math.round((grossCents * Math.max(0, Math.min(100, percent))) / 100);
}

export const EXPENSE_CATEGORIES = ["Aluguel", "Salários e encargos", "Impostos", "Materiais", "Marketing", "Software e serviços", "Contabilidade", "Outros"];
