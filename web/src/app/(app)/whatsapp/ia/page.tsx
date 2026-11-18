import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { DEFAULT_CRISIS_MESSAGE, DEFAULT_HANDOFF_MESSAGE } from "@/lib/ai";
import { saveAiConfigAction } from "@/app/actions/whatsapp";

export const dynamic = "force-dynamic";

const input = "w-full rounded border px-3 py-2 text-sm";

export default async function AiConfigPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const user = await requireRole("ADMIN");
  const sp = await searchParams;
  const config = await db.aiConfig.findUnique({ where: { clinicId: user.clinicId } });
  const approved = (config?.approvedContent ?? {}) as { enabled?: boolean; info?: string };
  const crisis = ((config?.crisisProtocol ?? {}) as { message?: string }).message ?? "";
  const handoff = ((config?.rules ?? {}) as { message?: string }).message ?? "";
  const keyConfigured = !!process.env.ANTHROPIC_API_KEY;

  const events = await db.aiEvent.findMany({
    where: { conversation: { clinicId: user.clinicId } },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/whatsapp" className="text-xs text-zinc-500 underline">← Conversas</Link>
      <h1 className="text-xl font-semibold">IA de recepção</h1>
      {sp.erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      {sp.ok && <p className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">Configuração salva.</p>}

      <section className="space-y-1 rounded border bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Antes de ligar</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>A IA responde <strong>apenas</strong> com o conteúdo aprovado abaixo. Não agenda, não consulta pacientes e não dá orientação clínica: nesses casos, transfere para a equipe.</li>
          <li>Mensagens com sinais de crise (risco à vida) recebem a mensagem de crise e a conversa é transferida na hora, sem passar pela IA.</li>
          <li>O texto das conversas atendidas pela IA é enviado ao provedor do modelo. Confirme com o responsável de privacidade a base legal e o contrato de tratamento de dados (LGPD) antes de ativar.</li>
          <li>Revise com o responsável técnico/clínico as mensagens de crise e de transferência.</li>
        </ul>
        <p className="pt-1">Chave do provedor de IA no servidor: <strong>{keyConfigured ? "configurada" : "não configurada (a IA não responde)"}</strong>.</p>
      </section>

      <form action={saveAiConfigAction} className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={!!approved.enabled} /> IA ligada para novas conversas
        </label>
        <label className="block text-sm">Conteúdo aprovado (horários, endereço, serviços, valores, políticas de cancelamento…)
          <textarea name="info" rows={10} maxLength={4000} defaultValue={approved.info ?? ""} className={input} />
        </label>
        <label className="block text-sm">Mensagem de crise (vazio usa a padrão)
          <textarea name="crisisMessage" rows={4} maxLength={800} defaultValue={crisis} placeholder={DEFAULT_CRISIS_MESSAGE} className={input} />
        </label>
        <label className="block text-sm">Mensagem de transferência para a equipe (vazio usa a padrão)
          <textarea name="handoffMessage" rows={2} maxLength={400} defaultValue={handoff} placeholder={DEFAULT_HANDOFF_MESSAGE} className={input} />
        </label>
        <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Salvar</button>
      </form>

      <section className="space-y-2">
        <h2 className="font-medium">Últimas ações da IA</h2>
        <ul className="divide-y rounded border text-xs">
          {events.length === 0 && <li className="p-3 text-zinc-500">Nenhuma ação ainda.</li>}
          {events.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 p-2">
              <span>{e.action === "RESPONDEU" ? "Respondeu" : "Transferiu"} · {e.intent}{e.handoffReason ? ` · ${e.handoffReason}` : ""}</span>
              <span className="text-zinc-500">{e.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
