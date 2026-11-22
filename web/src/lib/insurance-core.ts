// Regras puras de convênio (sem banco), para teste.
// Mesma regra de shareOf (money.ts), repetida aqui para o arquivo ser testável sem dependências.
const shareOf = (cents: number, percent: number) => Math.round((cents * Math.max(0, Math.min(100, percent))) / 100);

// Previsão de pagamento: data do atendimento (AAAA-MM-DD) + prazo do convênio, em UTC (meia-noite).
export function expectedPayDate(serviceDate: string, days: number): Date {
  const d = new Date(`${serviceDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.floor(days)));
  return d;
}

// Número da guia: lote + sequência (ex.: 12-007).
export function guideNumber(batchNumber: number, seq: number): string {
  return `${batchNumber}-${String(seq).padStart(3, "0")}`;
}

// Resultado do retorno do convênio para uma guia: pagou tudo ou glosou a diferença.
export function settle(amountCents: number, paidCents: number): { status: "PAGO" | "GLOSADO"; glossCents: number } | null {
  if (!Number.isInteger(paidCents) || paidCents < 0 || paidCents > amountCents) return null;
  return paidCents >= amountCents ? { status: "PAGO", glossCents: 0 } : { status: "GLOSADO", glossCents: amountCents - paidCents };
}

export type AuthCheck = { ok: true; remaining: number } | { ok: false; reason: string };

// A autorização cobre mais um atendimento na data informada?
// `used` conta os atendimentos que já ocupam sessões (agendados, confirmados ou realizados).
export function checkAuth(auth: { sessionsTotal: number; validUntil: Date | null }, used: number, on: Date): AuthCheck {
  if (auth.validUntil && auth.validUntil.getTime() < on.getTime()) return { ok: false, reason: "A autorização vence antes desta data." };
  const remaining = auth.sessionsTotal - used;
  if (remaining <= 0) return { ok: false, reason: "A autorização não tem mais sessões disponíveis." };
  return { ok: true, remaining };
}

// Repasse do profissional: particular pelo percentual dele; cada convênio pelo percentual do convênio,
// quando definido (senão, o do profissional). Arredonda por grupo, como no repasse sem convênio.
export function payoutShare(
  particularCents: number,
  professionalPercent: number,
  insurers: { percent: number | null; cents: number }[],
): { grossCents: number; shareCents: number } {
  let gross = particularCents;
  let share = shareOf(particularCents, professionalPercent);
  const byPercent = new Map<number, number>();
  for (const r of insurers) {
    gross += r.cents;
    const pct = r.percent ?? professionalPercent;
    byPercent.set(pct, (byPercent.get(pct) ?? 0) + r.cents);
  }
  for (const [pct, cents] of byPercent) share += shareOf(cents, pct);
  return { grossCents: gross, shareCents: share };
}
