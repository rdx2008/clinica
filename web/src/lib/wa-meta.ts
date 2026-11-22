// Sincronização de modelos com a Meta (Graph API). Sem dependências internas.

const GRAPH_VERSION = "v21.0";

export type MetaTemplate = { name: string; language: string; category: string; status: string; body: string };

// Lista os modelos da conta WhatsApp Business (com status de aprovação) para sincronizar com o sistema.
export async function fetchMetaTemplates(params: {
  token: string;
  wabaId: string;
}): Promise<{ ok: true; templates: MetaTemplate[] } | { ok: false; error: string }> {
  const out: MetaTemplate[] = [];
  let url: string | null = `https://graph.facebook.com/${GRAPH_VERSION}/${params.wabaId}/message_templates?limit=100&fields=name,status,language,category,components`;
  try {
    for (let page = 0; url && page < 5; page++) {
      const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${params.token}` }, signal: AbortSignal.timeout(15_000) });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { name: string; status: string; language: string; category: string; components?: { type: string; text?: string }[] }[];
        paging?: { next?: string };
        error?: { message?: string };
      };
      if (!res.ok) return { ok: false, error: json.error?.message ?? `Erro ${res.status} da API do WhatsApp` };
      for (const t of json.data ?? []) {
        const body = t.components?.find((c) => c.type === "BODY")?.text ?? "";
        out.push({ name: t.name, language: t.language, category: t.category, status: t.status, body });
      }
      url = json.paging?.next && json.paging.next.startsWith("https://graph.facebook.com/") ? json.paging.next : null;
    }
    return { ok: true, templates: out };
  } catch {
    return { ok: false, error: "Não foi possível falar com o WhatsApp." };
  }
}

export function mapMetaStatus(s: string): "APROVADO" | "REJEITADO" | "PENDENTE" {
  if (s === "APPROVED") return "APROVADO";
  if (s === "REJECTED" || s === "DISABLED" || s === "PAUSED") return "REJEITADO";
  return "PENDENTE";
}
