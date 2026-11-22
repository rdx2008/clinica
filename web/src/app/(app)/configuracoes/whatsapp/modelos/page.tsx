import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import {
  createAutomationAction,
  createTemplateAction,
  setTemplateStatusAction,
  toggleAutomationAction,
} from "@/app/actions/whatsapp";
import { syncTemplatesAction } from "@/app/actions/whatsapp2";

export const dynamic = "force-dynamic";

const input = "rounded border px-3 py-2 text-sm";
const btn = "rounded border px-2 py-1 text-xs";

export default async function AutomationsPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const user = await requireRole("ADMIN");
  const { erro, ok } = await searchParams;
  const [templates, automations] = await Promise.all([
    db.waTemplate.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" } }),
    db.automation.findMany({ where: { clinicId: user.clinicId }, include: { template: { select: { name: true, status: true } } } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/whatsapp" className="text-xs text-zinc-500 underline">← Conversas</Link>
      <h1 className="text-xl font-semibold">Modelos e lembretes</h1>
      {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
      {ok && <p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">{ok}</p>}

      <section className="space-y-3 rounded border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Modelos de mensagem</h2>
          <form action={syncTemplatesAction}><button className="rounded border px-3 py-1.5 text-sm">Sincronizar com a Meta</button></form>
        </div>
        <p className="text-xs text-zinc-500">
          Crie o modelo no Gerenciador do WhatsApp (Meta) e registre aqui o mesmo nome e texto. Só modelos marcados como aprovados são usados.
          Variáveis nos lembretes: {"{{1}}"} nome, {"{{2}}"} data, {"{{3}}"} hora, {"{{4}}"} profissional. Dica: termine o texto com “Responda 1 para confirmar ou 2 para cancelar” — a resposta confirma a consulta automaticamente.
        </p>
        <ul className="divide-y text-sm">
          {templates.length === 0 && <li className="py-2 text-zinc-500">Nenhum modelo.</li>}
          {templates.map((t) => (
            <li key={t.id} className="space-y-1 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{t.name} <span className="text-xs font-normal text-zinc-500">({t.language} · {t.category})</span></span>
                <form action={setTemplateStatusAction} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={t.id} />
                  <select name="status" defaultValue={t.status} className={btn}>
                    <option value="PENDENTE">Pendente</option>
                    <option value="APROVADO">Aprovado</option>
                    <option value="REJEITADO">Rejeitado</option>
                  </select>
                  <button className={btn}>Salvar</button>
                </form>
              </div>
              <p className="text-zinc-600">{t.body}</p>
            </li>
          ))}
        </ul>
        <form action={createTemplateAction} className="grid gap-2 sm:grid-cols-2">
          <input name="name" required placeholder="nome_do_modelo" className={input} />
          <input name="language" required defaultValue="pt_BR" className={input} />
          <select name="category" className={input}>
            <option value="UTILITY">Utilidade (lembretes, confirmações)</option>
            <option value="MARKETING">Marketing</option>
            <option value="AUTHENTICATION">Autenticação</option>
          </select>
          <textarea name="body" required rows={3} placeholder="Olá {{1}}, lembrete da sua consulta em {{2}} às {{3}} com {{4}}." className={`${input} sm:col-span-2`} />
          <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white sm:col-span-2">Registrar modelo</button>
        </form>
      </section>

      <section className="space-y-3 rounded border p-4">
        <h2 className="font-medium">Lembretes automáticos</h2>
        <p className="text-xs text-zinc-500">
          Enviados só a pacientes com autorização de WhatsApp vigente, para consultas agendadas ou confirmadas. Um envio por consulta; se a consulta for remarcada, o lembrete é reenviado.
        </p>
        <ul className="divide-y text-sm">
          {automations.length === 0 && <li className="py-2 text-zinc-500">Nenhum lembrete configurado.</li>}
          {automations.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {a.trigger === "PENDENCIA" ? "Aviso de pendências do portal" : `${a.offsetMin / 60} h antes`} · modelo <strong>{a.template.name}</strong>
                {a.template.status !== "APROVADO" && <span className="ml-2 text-xs text-amber-700">(modelo não aprovado: não será enviado)</span>}
              </span>
              <form action={toggleAutomationAction}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="active" value={String(!a.active)} />
                <button className={btn}>{a.active ? "Ligado — desligar" : "Desligado — ligar"}</button>
              </form>
            </li>
          ))}
        </ul>
        {templates.length > 0 && (
          <form action={createAutomationAction} className="flex flex-wrap items-center gap-2">
            <input name="hours" type="number" min={2} max={168} defaultValue={24} className={`${input} w-24`} />
            <span className="text-sm">horas antes, com o modelo</span>
            <select name="templateId" className={input}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button className="rounded border px-3 py-2 text-sm">Adicionar lembrete</button>
          </form>
        )}
        {templates.length > 0 && !automations.some((a) => a.trigger === "PENDENCIA") && (
          <form action={createAutomationAction} className="space-y-2 rounded border border-dashed p-3">
            <input type="hidden" name="trigger" value="PENDENCIA" />
            <p className="text-sm font-medium">Aviso de pendências do portal</p>
            <p className="text-xs text-zinc-500">
              Avisa o paciente (com autorização de WhatsApp) quando há questionário, tarefa ou termo para ele no portal. Um aviso por item, sem repetir, e sem nenhum conteúdo clínico na mensagem.
              Variáveis do modelo: {"{{1}}"} nome, {"{{2}}"} endereço do portal, {"{{3}}"} resumo (ex.: “1 questionário e 1 tarefa”).
              Exemplo: “Olá {"{{1}}"}, você tem {"{{3}}"} no portal da clínica: {"{{2}}"}”. Exige o endereço do portal configurado.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select name="templateId" className={input}>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button className="rounded border px-3 py-2 text-sm">Adicionar aviso de pendências</button>
            </div>
          </form>
        )}
        <p className="text-xs text-zinc-500">
          Os lembretes saem quando um agendador chama <code>POST /api/cron/lembretes</code> com o cabeçalho <code>Authorization: Bearer CRON_SECRET</code> (ex.: tarefa agendada do Coolify a cada 10 minutos).
        </p>
      </section>
    </div>
  );
}
