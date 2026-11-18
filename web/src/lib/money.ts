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
