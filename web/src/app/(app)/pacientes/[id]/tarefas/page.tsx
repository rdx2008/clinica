import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { canAccessPatient, requireClinician } from "@/lib/clinical";
import { cancelTaskAction, createTaskAction } from "@/app/actions/tasks";

export const dynamic = "force-dynamic";

const input = "rounded border bg-white px-3 py-2 text-sm";
const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const fmtDue = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });

export default async function TasksPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { user, professionalId } = await requireClinician();
  const { id } = await params;
  const sp = await searchParams;
  if (!(await canAccessPatient(user.clinicId, professionalId, id))) notFound();

  const [patient, rows] = await Promise.all([
    db.patient.findFirst({ where: { id, clinicId: user.clinicId }, select: { fullName: true, email: true } }),
    db.patientTask.findMany({ where: { clinicId: user.clinicId, patientId: id, professionalId, status: { not: "CANCELADA" } }, orderBy: { createdAt: "desc" } }),
  ]);
  if (!patient) notFound();

  await audit({ clinicId: user.clinicId, userId: user.id, action: "TAREFAS_VISUALIZADAS", entity: "Patient", entityId: id });
  // Retornos abertos contam como vistos.
  await db.patientTask.updateMany({ where: { clinicId: user.clinicId, patientId: id, professionalId, status: "FEITA", seenAt: null }, data: { seenAt: new Date() } });

  const pending = rows.filter((r) => r.status === "PENDENTE");
  const done = rows.filter((r) => r.status === "FEITA");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={`/pacientes/${id}/prontuario`} className="text-xs text-zinc-500 underline">← Prontuário de {patient.fullName}</Link>
      <h1 className="text-2xl">Tarefas entre sessões</h1>
      <p className="text-sm text-zinc-600">
        Combine uma tarefa com o paciente (registro de pensamentos, exercício, leitura...). Ele recebe pelo portal, marca como feita e pode deixar um retorno. Só você vê o conteúdo e o retorno.
      </p>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <form action={createTaskAction} className="space-y-3 rounded border bg-white p-4">
        <h2>Nova tarefa</h2>
        <input type="hidden" name="patientId" value={id} />
        <label className="block text-sm">Título<input name="title" required minLength={3} maxLength={120} placeholder="Ex.: Registro de pensamentos da semana" className={`${input} mt-1 w-full`} /></label>
        <label className="block text-sm">Instruções (opcional)<textarea name="text" rows={4} maxLength={2000} className={`${input} mt-1 w-full`} /></label>
        <label className="block text-sm">Para quando (opcional)<input name="dueDate" type="date" className={`${input} mt-1`} /></label>
        <button disabled={!patient.email} className="rounded bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-50">Enviar pelo portal</button>
        {!patient.email && <p className="text-xs text-amber-700">Cadastre o e-mail do paciente para enviar tarefas pelo portal.</p>}
      </form>

      <section className="space-y-2">
        <h2>Aguardando o paciente ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="rounded-xl border bg-white p-4 text-sm text-zinc-500">Nenhuma tarefa pendente.</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((t) => (
              <li key={t.id} className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
                <p className="font-medium">{decryptField(t.titleEnc)}</p>
                {t.textEnc && <p className="whitespace-pre-wrap text-sm text-zinc-600">{decryptField(t.textEnc)}</p>}
                <p className="text-xs text-zinc-500">enviada em {fmt(t.createdAt)}{t.dueDate ? ` · para ${fmtDue(t.dueDate)}` : ""}</p>
                <form action={cancelTaskAction}><input type="hidden" name="id" value={t.id} /><button className="rounded border px-2 py-1 text-xs">Cancelar</button></form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2>Concluídas ({done.length})</h2>
        {done.length === 0 ? (
          <p className="rounded-xl border bg-white p-4 text-sm text-zinc-500">Nenhuma tarefa concluída ainda.</p>
        ) : (
          <ul className="space-y-2">
            {done.map((t) => (
              <li key={t.id} className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
                <p className="font-medium">{decryptField(t.titleEnc)}</p>
                <p className="text-xs text-zinc-500">feita em {t.doneAt ? fmt(t.doneAt) : "—"}</p>
                {t.responseEnc ? (
                  <p className="whitespace-pre-wrap rounded bg-zinc-50 p-3 text-sm">{decryptField(t.responseEnc)}</p>
                ) : (
                  <p className="text-xs text-zinc-500">Sem retorno escrito.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
