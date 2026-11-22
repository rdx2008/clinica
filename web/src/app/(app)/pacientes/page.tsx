import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { formatPhoneBR, onlyDigits } from "@/lib/br";

export const dynamic = "force-dynamic";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; inativos?: string; tag?: string }>;
}) {
  const user = await requireRole("ADMIN", "RECEPCAO", "PROFISSIONAL");
  const { q = "", inativos, tag = "" } = await searchParams;
  const term = q.trim();
  const digits = onlyDigits(term);
  const status = inativos ? "INATIVO" : "ATIVO";

  const where = {
    clinicId: user.clinicId,
    status,
    ...(tag ? { tags: { has: tag } } : {}),
    ...(term
      ? {
          OR: [
            { fullName: { contains: term, mode: "insensitive" as const } },
            ...(digits.length >= 4 ? [{ phoneE164: { contains: digits } }] : []),
            { email: { contains: term, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [patients, total, tagRows] = await Promise.all([
    db.patient.findMany({
      where,
      orderBy: { fullName: "asc" },
      take: 50,
      select: { id: true, fullName: true, phoneE164: true, tags: true, birthDate: true },
    }),
    db.patient.count({ where }),
    db.patient.findMany({ where: { clinicId: user.clinicId, status }, select: { tags: true }, take: 1000 }),
  ]);
  const allTags = [...new Set(tagRows.flatMap((r) => r.tags))].sort().slice(0, 20);
  const link = (t: string) => `/pacientes?${new URLSearchParams({ ...(term ? { q: term } : {}), ...(inativos ? { inativos: "1" } : {}), ...(t ? { tag: t } : {}) })}`;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl">Pacientes</h1>
          <p className="text-sm text-zinc-600">{total} {inativos ? "inativo(s)" : "ativo(s)"}{tag && ` com a etiqueta “${tag}”`}</p>
        </div>
        <div className="flex gap-2">
          {user.role !== "PROFISSIONAL" && <Link href="/pacientes/importar" className="rounded border px-3 py-2 text-sm">Importar planilha</Link>}
          <Link href="/pacientes/novo" className="rounded bg-emerald-700 px-3 py-2 text-sm text-white">Novo paciente</Link>
        </div>
      </div>

      <form className="flex flex-wrap gap-2">
        {tag && <input type="hidden" name="tag" value={tag} />}
        <input name="q" defaultValue={term} placeholder="Buscar por nome, telefone ou e-mail" className="min-w-[14rem] flex-1 rounded border px-3 py-2 text-sm" />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="inativos" value="1" defaultChecked={!!inativos} /> inativos
        </label>
        <button className="rounded border px-3 py-2 text-sm">Buscar</button>
      </form>

      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-zinc-500">Etiquetas:</span>
          {tag && <Link href={link("")} className="rounded-full bg-zinc-800 px-2.5 py-1 text-white">{tag} ✕</Link>}
          {allTags.filter((t) => t !== tag).map((t) => (
            <Link key={t} href={link(t)} className="rounded-full border bg-white px-2.5 py-1 hover:bg-zinc-50">{t}</Link>
          ))}
        </div>
      )}

      {patients.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white/60 p-10 text-center text-sm text-zinc-500">
          <p>Nenhum paciente encontrado.</p>
          <p className="mt-1">
            <Link href="/pacientes/novo" className="text-emerald-700 underline">Cadastrar o primeiro paciente</Link>
            {user.role !== "PROFISSIONAL" && <> ou <Link href="/pacientes/importar" className="text-emerald-700 underline">importar uma planilha</Link></>}.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded border">
          {patients.map((p) => (
            <li key={p.id}>
              <Link href={`/pacientes/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800">
                    {p.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                  </span>
                  <span className="font-medium">{p.fullName}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  {p.phoneE164 ? formatPhoneBR(p.phoneE164) : "sem telefone"}
                  {p.tags.slice(0, 3).map((t) => (
                    <span key={t} className="rounded-full border px-2 py-0.5">{t}</span>
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {total > 50 && <p className="text-xs text-zinc-500">Mostrando os 50 primeiros de {total}. Refine a busca.</p>}
    </div>
  );
}
