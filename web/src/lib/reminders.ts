// Regra de quando um lembrete deve sair (pura, testável).
// offsetMin = quantos minutos ANTES da consulta (ex.: 1440 = 24 h antes).

export const MIN_LEAD_MS = 60 * 60_000; // não lembra consulta que começa em menos de 1 h
export const MAX_LATE_MS = 6 * 3600_000; // se o agendador ficou parado mais que isso, não envia tardio

export type ReminderState = "cedo" | "enviar" | "atrasado" | "muito_proxima";

export function reminderState(startsAt: Date, offsetMin: number, now: Date = new Date()): ReminderState {
  const due = startsAt.getTime() - offsetMin * 60_000;
  if (now.getTime() < due) return "cedo";
  if (startsAt.getTime() - now.getTime() < MIN_LEAD_MS) return "muito_proxima";
  if (now.getTime() - due > MAX_LATE_MS) return "atrasado";
  return "enviar";
}

// Variáveis do modelo, nesta ordem: {{1}} nome, {{2}} data, {{3}} hora, {{4}} profissional.
export function reminderVars(p: { patientName: string; date: string; time: string; professional: string }): string[] {
  const first = p.patientName.trim().split(/\s+/)[0] ?? "";
  const [y, m, d] = p.date.split("-");
  return [first, `${d}/${m}/${y}`, p.time, p.professional];
}
