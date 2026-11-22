import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { formatPhoneBR } from "@/lib/br";
import { mergePatientsAction } from "@/app/actions/patients-admin";

export const dynamic = "force-dynamic";

export default async function MergePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; erro?: string }>;
}) {
  const user = await requireRole("ADMIN", "RECEPCAO");
  const { id } = await params;
  const sp = await searchParams;
  const term = (sp.q ?? "").trim();

  const keep = await db.patient.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!keep) notFound();
  const candidates = term
    ? await db.patient.findMany({
        where: { clinicId: user.clinicId, id: { not: id }, fullName: { contains: term, mode: "insensitive" } },
        orderBy: { fullName: "asc" },
        take: 20,
        select: { id: true, fullName: true, phoneE164: true, birthDate: true, _count: { select: { appointments: true, charges: true } } },
      })
    : [];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link href={`/pacientes/${id}?aba=dados`} className="text-xs text-zinc-500 underline">← {keep.fullName}</Link>
        <h1 className="text-2xl">Mesclar cadastro duplicado</h1>
        <p className="text-sm text-zinc-600">
          O cadastro de <strong>{keep.fullName}</strong> será mantido. Atendimentos, cobranças, prontuário, consentimentos e conversas do cadastro duplicado passam para ele, e o duplicado é removido. Não há como desfazer.
        </p>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <form className="flex gap-2">
        <input name="q" defaultValue={term} placeholder="Buscar o cadastro duplicado pelo nome" className="flex-1 rounded border px-3 py-2 text-sm" />
        <button className="rounded border px-3 py-2 text-sm">Buscar</button>
      </form>

      {term && candidates.length === 0 && <p className="text-sm text-zinc-500">Nenhum cadastro encontrado.</p>}
      <ul className="space-y-2">
        {candidates.map((c) => (
          <li key={c.id} className="rounded border p-3 text-sm">
            <form action={mergePatientsAction} className="flex flex-wrap items-center justify-between gap-3">
              <input type="hidden" name="keepId" value={id} />
              <input type="hidden" name="dropId" value={c.id} />
              <div>
                <p className="font-medium">{c.fullName}</p>
                <p className="text-xs text-zinc-500">
                  {c.phoneE164 ? formatPhoneBR(c.phoneE164) : "sem telefone"}
                  {c.birthDate && ` · nasc. ${c.birthDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`}
                  {` · ${c._count.appointments} atendimentos · ${c._count.charges} cobranças`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="confirm" required /> Entendo que é definitivo</label>
                <button className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700">Mesclar neste cadastro</button>
              </div>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
