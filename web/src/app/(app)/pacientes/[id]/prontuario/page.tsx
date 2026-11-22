import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canAccessPatient, RECORD_TYPE_LABEL, requireClinician } from "@/lib/clinical";

export const dynamic = "force-dynamic";

export default async function RecordsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tipo?: string }> }) {
  const { user, professionalId } = await requireClinician();
  const { id } = await params;
  const { tipo } = await searchParams;
  if (!(await canAccessPatient(user.clinicId, professionalId, id))) notFound();

  const [patient, records] = await Promise.all([
    db.patient.findFirst({ where: { id, clinicId: user.clinicId }, select: { fullName: true } }),
    db.clinicalRecord.findMany({
      where: { clinicId: user.clinicId, patientId: id, professionalId, ...(tipo && tipo in RECORD_TYPE_LABEL ? { type: tipo as never } : {}) },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, status: true, version: true, createdAt: true },
    }),
  ]);
  if (!patient) notFound();

  await audit({ clinicId: user.clinicId, userId: user.id, action: "PRONTUARIO_LISTA_VISUALIZADA", entity: "Patient", entityId: id });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/pacientes/${id}`} className="text-xs text-zinc-500 underline">← {patient.fullName}</Link>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Prontuário</h1>
        <div className="flex gap-2">
          <Link href={`/pacientes/${id}/escalas`} className="rounded border px-3 py-2 text-sm">Escalas</Link>
          <Link href={`/pacientes/${id}/plano`} className="rounded border px-3 py-2 text-sm">Plano terapêutico</Link>
          <Link href={`/pacientes/${id}/prontuario/novo?tipo=DOCUMENTO`} className="rounded border px-3 py-2 text-sm">Novo documento</Link>
          <Link href={`/pacientes/${id}/prontuario/novo`} className="rounded bg-emerald-700 px-3 py-2 text-sm text-white">Novo registro</Link>
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        Conteúdo sigiloso: visível apenas para você. Administração e recepção não têm acesso aos registros.
      </p>
      <div className="flex flex-wrap gap-1.5 text-xs">
        <Link href={`/pacientes/${id}/prontuario`} className={`rounded-full border px-2.5 py-1 ${!tipo ? "bg-zinc-800 text-white" : "bg-white"}`}>Todos</Link>
        {Object.entries(RECORD_TYPE_LABEL).map(([k, v]) => (
          <Link key={k} href={`/pacientes/${id}/prontuario?tipo=${k}`} className={`rounded-full border px-2.5 py-1 ${tipo === k ? "bg-zinc-800 text-white" : "bg-white"}`}>{v}</Link>
        ))}
      </div>
      <ul className="divide-y rounded border text-sm">
        {records.length === 0 && <li className="p-3 text-zinc-500">Nenhum registro ainda.</li>}
        {records.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 p-3">
            <Link href={`/pacientes/${id}/prontuario/${r.id}`} className="font-medium underline">
              {RECORD_TYPE_LABEL[r.type]}
            </Link>
            <span className="text-xs text-zinc-500">
              {r.createdAt.toLocaleDateString("pt-BR")} · {r.status === "APROVADO" ? "aprovado" : "rascunho"} · v{r.version}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
