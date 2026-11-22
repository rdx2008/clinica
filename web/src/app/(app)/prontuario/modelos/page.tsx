import Link from "next/link";
import { db } from "@/lib/db";
import { MAX_RECORD_CHARS, RECORD_TYPE_LABEL, requireClinician } from "@/lib/clinical";
import { DEFAULT_TEMPLATES, TEMPLATE_VARS } from "@/lib/record-templates";
import { createTemplateAction, deleteTemplateAction } from "@/app/actions/records";

export const dynamic = "force-dynamic";

const input = "w-full rounded border px-3 py-2 text-sm";

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { user, professionalId } = await requireClinician();
  const sp = await searchParams;
  const mine = await db.recordTemplate.findMany({ where: { clinicId: user.clinicId, professionalId }, orderBy: { name: "asc" } });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/pacientes" className="text-xs text-zinc-500 underline">← Pacientes</Link>
        <h1 className="text-2xl">Modelos de registro e documentos</h1>
        <p className="text-sm text-zinc-600">Crie seus próprios modelos. Ao escrever um registro, escolha o modelo e o texto já vem preenchido.</p>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <section className="space-y-3 rounded border p-4">
        <h2>Meus modelos</h2>
        {mine.length === 0 && <p className="text-sm text-zinc-500">Você ainda não criou modelos.</p>}
        <ul className="divide-y text-sm">
          {mine.map((t) => (
            <li key={t.id} className="space-y-1 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{t.name} <span className="text-xs font-normal text-zinc-500">· {RECORD_TYPE_LABEL[t.type]}</span></span>
                <form action={deleteTemplateAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="rounded border px-2 py-1 text-xs">Remover</button>
                </form>
              </div>
              <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-2 font-sans text-xs text-zinc-600">{t.content}</pre>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded border p-4">
        <h2>Novo modelo</h2>
        <form action={createTemplateAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Nome
              <input name="name" required className={input} />
            </label>
            <label className="text-sm">Tipo
              <select name="type" defaultValue="EVOLUCAO" className={input}>
                {Object.entries(RECORD_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-sm">Texto
            <textarea name="content" required rows={10} maxLength={MAX_RECORD_CHARS} className={input} />
          </label>
          <p className="text-xs text-zinc-500">
            Variáveis preenchidas automaticamente: {TEMPLATE_VARS.map((v) => <code key={v} className="mr-1">{v}</code>)}
          </p>
          <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Salvar modelo</button>
        </form>
      </section>

      <section className="space-y-2 rounded border p-4">
        <h2>Modelos incluídos no sistema</h2>
        <ul className="list-disc pl-5 text-sm text-zinc-600">
          {DEFAULT_TEMPLATES.map((t) => <li key={t.name}>{t.name} <span className="text-xs text-zinc-400">({RECORD_TYPE_LABEL[t.type]})</span></li>)}
        </ul>
      </section>
    </div>
  );
}
