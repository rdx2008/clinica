// Texto do aviso de pendências do portal (puro, testável). Nunca inclui conteúdo clínico:
// só a contagem por tipo, para não expor nada no WhatsApp.

export type NoticeKind = "ESCALA" | "TERMO" | "TAREFA";

const LABEL: Record<NoticeKind, [string, string]> = {
  ESCALA: ["questionário", "questionários"],
  TERMO: ["termo para aceitar", "termos para aceitar"],
  TAREFA: ["tarefa", "tarefas"],
};

export function noticeSummary(kinds: NoticeKind[]): string {
  const order: NoticeKind[] = ["TERMO", "ESCALA", "TAREFA"];
  const parts: string[] = [];
  for (const k of order) {
    const n = kinds.filter((x) => x === k).length;
    if (n > 0) parts.push(`${n} ${LABEL[k][n === 1 ? 0 : 1]}`);
  }
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

// Variáveis do modelo, nesta ordem: {{1}} nome, {{2}} endereço do portal, {{3}} resumo das pendências.
export function noticeVars(firstName: string, portalUrl: string, kinds: NoticeKind[]): string[] {
  return [firstName, portalUrl, noticeSummary(kinds)];
}

// Endereço público do portal: APP_URL (ou o que o Coolify injeta) + /p/<slug>.
export function portalUrl(base: string | undefined, slug: string | null): string | null {
  if (!base || !slug) return null;
  const first = base.split(",")[0].trim().replace(/\/+$/, "");
  if (!first) return null;
  const withScheme = /^https?:\/\//i.test(first) ? first : `https://${first}`;
  return `${withScheme}/p/${slug}`;
}
