import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { localDate, localTime } from "@/lib/agenda";
import { canAccessPatient, MAX_RECORD_CHARS, RECORD_TYPE_LABEL, requireClinician } from "@/lib/clinical";
import { createRecordAction } from "@/app/actions/records";

export const dynamic = "force-dynamic";

const input = "w-full rounded border px-3 py-2 text-sm";

export default async function NewRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; atendimento?: string }>;
}) {
  const { user, professionalId } = await requireClinician();
  const { id } = await params;
  const sp = await searchParams;
  if (!(await canAccessPatient(user.clinicId, professionalId, id))) notFound();

  const appointments = await db.appointment.findMany({
    where: { clinicId: user.clinicId, patientId: id, professionalId, status: { not: "CANCELADA" } },
    orderBy: { startsAt: "desc" },
    take: 30,
    select: { id: true, startsAt: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/pacientes/${id}/prontuario`} className="text-xs text-zinc-500 underline">← Prontuário</Link>
      <h1 className="text-xl font-semibold">Novo registro</h1>
      {sp.erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      <form action={createRecordAction} className="space-y-3">
        <input type="hidden" name="patientId" value={id} />
        <label className="block text-sm">Tipo
          <select name="type" defaultValue="EVOLUCAO" className={input}>
            {Object.entries(RECORD_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="block text-sm">Atendimento relacionado (opcional)
          <select name="appointmentId" defaultValue={sp.atendimento ?? ""} className={input}>
            <option value="">Nenhum</option>
            {appointments.map((a) => (
              <option key={a.id} value={a.id}>{localDate(a.startsAt).split("-").reverse().join("/")} {localTime(a.startsAt)}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">Conteúdo
          <textarea name="content" required rows={14} maxLength={MAX_RECORD_CHARS} className={input} />
        </label>
        <p className="text-xs text-zinc-500">Salvo como rascunho e criptografado. Depois de aprovado, o registro não pode mais ser alterado.</p>
        <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Salvar rascunho</button>
      </form>
    </div>
  );
}
