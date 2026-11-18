import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { formatPhoneBR, onlyDigits } from "@/lib/br";

export const dynamic = "force-dynamic";

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string; inativos?: string }> }) {
  const user = await requireRole("ADMIN", "RECEPCAO", "PROFISSIONAL");
  const { q = "", inativos } = await searchParams;
  const term = q.trim();
  const digits = onlyDigits(term);

  const patients = await db.patient.findMany({
    where: {
      clinicId: user.clinicId,
      status: inativos ? "INATIVO" : "ATIVO",
      ...(term
        ? {
            OR: [
              { fullName: { contains: term, mode: "insensitive" } },
              ...(digits.length >= 4 ? [{ phoneE164: { contains: digits } }] : []),
              { email: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { fullName: "asc" },
    take: 50,
    select: { id: true, fullName: true, phoneE164: true, tags: true },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pacientes</h1>
        <Link href="/pacientes/novo" className="rounded bg-emerald-700 px-3 py-2 text-sm text-white">Novo paciente</Link>
      </div>
      <form className="flex gap-2">
        <input name="q" defaultValue={term} placeholder="Buscar por nome, telefone ou e-mail" className="flex-1 rounded border px-3 py-2 text-sm" />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="inativos" value="1" defaultChecked={!!inativos} /> inativos
        </label>
        <button className="rounded border px-3 py-2 text-sm">Buscar</button>
      </form>
      {patients.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhum paciente encontrado.</p>
      ) : (
        <ul className="divide-y rounded border">
          {patients.map((p) => (
            <li key={p.id}>
              <Link href={`/pacientes/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <span className="font-medium">{p.fullName}</span>
                <span className="text-xs text-zinc-500">
                  {p.phoneE164 ? formatPhoneBR(p.phoneE164) : "sem telefone"}
                  {p.tags.length > 0 && ` · ${p.tags.join(", ")}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {patients.length === 50 && <p className="text-xs text-zinc-500">Mostrando os 50 primeiros. Refine a busca.</p>}
    </div>
  );
}
