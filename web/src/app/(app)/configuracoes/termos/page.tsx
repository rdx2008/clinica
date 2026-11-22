import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { deactivateTermAction, saveTermAction, seedTermsAction } from "@/app/actions/terms";

export const dynamic = "force-dynamic";

const input = "w-full rounded border px-3 py-2 text-sm";

export default async function TermsAdminPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string; editar?: string }> }) {
  const admin = await requireRole("ADMIN");
  const sp = await searchParams;
  const docs = await db.clinicDocument.findMany({ where: { clinicId: admin.clinicId }, orderBy: [{ key: "asc" }, { version: "desc" }], include: { _count: { select: { acceptances: true } } } });
  const latest = new Map<string, (typeof docs)[number]>();
  for (const d of docs) if (!latest.has(d.key)) latest.set(d.key, d);
  const editing = sp.editar ? latest.get(sp.editar) : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/configuracoes" className="text-xs text-zinc-500 underline">← Configurações</Link>
        <h1 className="text-2xl">Termos e contratos</h1>
        <p className="text-sm text-zinc-600">Termo de consentimento e contrato terapêutico. O paciente aceita pelo portal ou presencialmente; cada aceite guarda quem aceitou, quando e qual versão.</p>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      {sp.ok && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}

      <p className="rounded-lg border bg-amber-50 p-3 text-xs text-amber-900">
        Os modelos são um ponto de partida. Revise o texto com o responsável técnico e o jurídico da clínica antes de publicar. Variáveis disponíveis: <code>{"{clinica}"}</code> e <code>{"{cnpj}"}</code>.
      </p>

      {latest.size === 0 && (
        <form action={seedTermsAction}>
          <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Criar modelos (termo de consentimento e contrato)</button>
        </form>
      )}

      <ul className="space-y-3">
        {[...latest.values()].map((d) => (
          <li key={d.id} className="space-y-1 rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{d.title}</p>
                <p className="text-xs text-zinc-500">
                  {d.kind} · versão {d.version} · {d.active ? "ativo" : "desativado"} · {d._count.acceptances} aceite(s) nesta versão
                </p>
              </div>
              <div className="flex gap-2">
                <Link href={`/configuracoes/termos?editar=${d.key}`} className="rounded border px-3 py-1.5 text-xs">Editar (nova versão)</Link>
                {d.active && (
                  <form action={deactivateTermAction}><input type="hidden" name="key" value={d.key} /><button className="rounded border px-3 py-1.5 text-xs">Desativar</button></form>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <section className="space-y-3 rounded border p-5">
        <h2>{editing ? `Nova versão de “${editing.title}”` : "Novo documento"}</h2>
        <form action={saveTermAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">Identificador
              <input name="key" required defaultValue={editing?.key ?? ""} readOnly={!!editing} placeholder="ex.: tcle" className={`${input} ${editing ? "bg-zinc-100" : ""}`} />
            </label>
            <label className="text-sm">Tipo
              <select name="kind" defaultValue={editing?.kind ?? "OUTRO"} className={input}>
                <option value="TCLE">Termo de consentimento</option>
                <option value="CONTRATO">Contrato</option>
                <option value="OUTRO">Outro</option>
              </select>
            </label>
            <label className="text-sm sm:col-span-3">Título
              <input name="title" required defaultValue={editing?.title ?? ""} className={input} />
            </label>
          </div>
          <label className="block text-sm">Texto
            <textarea name="body" required rows={16} defaultValue={editing?.body ?? ""} className={input} />
          </label>
          <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">{editing ? "Publicar nova versão" : "Publicar"}</button>
        </form>
      </section>
    </div>
  );
}
