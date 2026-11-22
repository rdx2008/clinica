import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { canAccessPatient, requireClinician } from "@/lib/clinical";
import { formatBRL } from "@/lib/money";
import { requestPackageAction } from "@/app/actions/packages";

export const dynamic = "force-dynamic";

const input = "w-full rounded border bg-white px-3 py-2 text-sm";

// O profissional indica um pacote do catálogo; a recepção ou o financeiro conclui a venda.
export default async function RequestPackagePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { user, professionalId } = await requireClinician();
  const { id } = await params;
  const sp = await searchParams;
  if (!(await canAccessPatient(user.clinicId, professionalId, id))) notFound();
  const [patient, plans, pending] = await Promise.all([
    db.patient.findFirst({ where: { id, clinicId: user.clinicId }, select: { fullName: true } }),
    db.packagePlan.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: { name: "asc" } }),
    db.packageRequest.count({ where: { clinicId: user.clinicId, patientId: id, status: "PENDENTE" } }),
  ]);
  if (!patient) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href={`/pacientes/${id}/prontuario`} className="text-xs text-zinc-500 underline">← Prontuário de {patient.fullName}</Link>
      <h1 className="text-2xl">Solicitar pacote</h1>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      <p className="text-sm text-zinc-600">
        Você indica o pacote; a recepção ou o financeiro faz a venda e a cobrança. O valor e as sessões já vêm do catálogo da clínica.
        {pending > 0 && <strong className="block text-amber-800">Este paciente já tem {pending} pedido(s) pendente(s).</strong>}
      </p>
      {plans.length === 0 ? (
        <p className="rounded border bg-white p-4 text-sm text-zinc-600">A clínica ainda não cadastrou modelos de pacote.</p>
      ) : (
        <form action={requestPackageAction} className="space-y-3 rounded border bg-white p-4">
          <input type="hidden" name="patientId" value={id} />
          <label className="block text-sm">Pacote
            <select name="planId" required defaultValue="" className={input}>
              <option value="" disabled>Selecione…</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sessions} sessões · {formatBRL(p.priceCents)}</option>)}
            </select>
          </label>
          <label className="block text-sm">Observação para a recepção (opcional)
            <textarea name="note" rows={2} maxLength={300} placeholder="Ex.: combinado na sessão de hoje; pode pagar em duas vezes" className={input} />
          </label>
          <p className="text-xs text-zinc-500">Não escreva informações clínicas aqui: a recepção e o financeiro veem esta observação.</p>
          <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Enviar pedido</button>
        </form>
      )}
    </div>
  );
}
