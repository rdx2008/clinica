// Regras puras da agenda (sem dependências internas, testável isoladamente).
// Fuso: America/Sao_Paulo é UTC-3 fixo (sem horário de verão desde 2019).

const OFFSET = "-03:00";
export const TZ = "America/Sao_Paulo";
export const MAX_RECURRENCE = 52;

// "2026-11-18" + "14:30" (horário local da clínica) -> Date em UTC. Null se inválido.
export function parseLocal(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00.000${OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Início e fim (UTC) do dia local da clínica.
export function dayRange(date: string): { start: Date; end: Date } | null {
  const start = parseLocal(date, "00:00");
  if (!start) return null;
  return { start, end: new Date(start.getTime() + 24 * 3600_000) };
}

// Data local (YYYY-MM-DD) de um instante.
export function localDate(d: Date): string {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

export function localTime(d: Date): string {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(11, 16);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00.000${OFFSET}`);
  d.setUTCDate(d.getUTCDate() + n);
  return localDate(d);
}

export function weekdayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00.000${OFFSET}`);
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: TZ });
}

// Intervalos [início, fim) se sobrepõem?
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// Repete semanalmente: devolve `count` ocorrências (a primeira é a própria).
export function weeklyOccurrences(start: Date, end: Date, count: number): { startsAt: Date; endsAt: Date }[] {
  const n = Math.max(1, Math.min(count, MAX_RECURRENCE));
  return Array.from({ length: n }, (_, i) => ({
    startsAt: new Date(start.getTime() + i * 7 * 24 * 3600_000),
    endsAt: new Date(end.getTime() + i * 7 * 24 * 3600_000),
  }));
}

// Link de videochamada: só http(s).
export function validMeetingUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export const STATUS_LABEL: Record<string, string> = {
  AGENDADA: "Agendada",
  CONFIRMADA: "Confirmada",
  COMPARECEU: "Compareceu",
  FALTOU: "Faltou",
  CANCELADA: "Cancelada",
  REMARCADA: "Remarcada",
};

// Status que ocupam o horário (cancelada/remarcada liberam).
export const ACTIVE_STATUSES = ["AGENDADA", "CONFIRMADA", "COMPARECEU", "FALTOU"] as const;

// Instante relativo a agora (isolado aqui para manter páginas livres de chamadas impuras).
export function nowPlus(ms: number): Date {
  return new Date(Date.now() + ms);
}

export type Window = { weekday: number; startTime: string; endTime: string };

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// Dia da semana (0 = domingo) no fuso da clínica.
export function localWeekday(d: Date): number {
  return new Date(d.getTime() - 3 * 3600_000).getUTCDay();
}

// O atendimento cabe inteiro numa janela de atendimento do mesmo dia? Sem janelas cadastradas, não restringe.
export function withinAvailability(start: Date, end: Date, windows: Window[]): boolean {
  if (windows.length === 0) return true;
  if (localDate(start) !== localDate(end)) return false;
  const wd = localWeekday(start);
  const s = localTime(start);
  const e = localTime(end);
  return windows.some((w) => w.weekday === wd && s >= w.startTime && e <= w.endTime);
}

// Paleta usada quando o profissional ainda não escolheu cor na agenda.
export const DEFAULT_COLORS = ["#0f6b5d", "#2563eb", "#9333ea", "#db2777", "#ea580c", "#ca8a04", "#0891b2", "#4b5563"];

export function professionalColor(color: string | null | undefined, index: number): string {
  return color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}
