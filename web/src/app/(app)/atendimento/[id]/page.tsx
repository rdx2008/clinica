import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { localDate, localTime, STATUS_LABEL } from "@/lib/agenda";
import { RECORD_TYPE_LABEL, requireClinician } from "@/lib/clinical";

export const dynamic = "force-dynamic";

const chip = "rounded border bg-white px-3 py-2 text-sm";
const excerpt = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);
const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

// Painel para usar ao lado da videochamada: tudo o que o profissional precisa durante a sessão.
export default async function AttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { user, professionalId } = await requireClinician();
  const { id } = await params;

  const a = await db.appointment.findFirst({
    where: { id, clinicId: user.clinicId, professionalId },
    include: { patient: { select: { id: true, fullName: true } }, service: { select: { name: true, modality: true } } },
  });
  if (!a) notFound();
  const pid = a.patient.id;

  const [lastEvolution, recent, plan, tasks, risks, sessions] = await Promise.all([
    db.clinicalRecord.findFirst({
      where: { clinicId: user.clinicId, patientId: pid, professionalId, type: "EVOLUCAO" },
      orderBy: { createdAt: "desc" },
      select: { id: true, contentEnc: true, createdAt: true },
    }),
    db.clinicalRecord.findMany({
      where: { clinicId: user.clinicId, patientId: pid, professionalId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, type: true, status: true, createdAt: true },
    }),
    db.therapyPlan.findFirst({
      where: { clinicId: user.clinicId, patientId: pid, professionalId, status: "ATIVO" },
      include: { goals: { where: { status: "EM_ANDAMENTO" }, orderBy: { createdAt: "asc" } } },
    }),
    db.patientTask.findMany({ where: { clinicId: user.clinicId, patientId: pid, professionalId, status: { in: ["PENDENTE", "FEITA"] } }, select: { status: true, seenAt: true } }),
    db.scaleAssignment.count({ where: { clinicId: user.clinicId, patientId: pid, professionalId, status: "RESPONDIDA", riskFlag: true, riskAckAt: null } }),
    db.appointment.count({ where: { clinicId: user.clinicId, patientId: pid, professionalId, status: "COMPARECEU" } }),
  ]);

  await audit({ clinicId: user.clinicId, userId: user.id, action: "ATENDIMENTO_ABERTO", entity: "Appointment", entityId: id });

  const pendingTasks = tasks.filter((t) => t.status === "PENDENTE").length;
  const newReturns = tasks.filter((t) => t.status === "FEITA" && !t.seenAt).length;
  const last = lastEvolution ? decryptField(lastEvolution.contentEnc) : null;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{a.patient.fullName}</h1>
        <p className="text-sm text-zinc-600">
          {fmt(a.startsAt)} · {localTime(a.startsAt)}–{localTime(a.endsAt)} · {a.service.name} · {STATUS_LABEL[a.status]}
        </p>
        <p className="text-xs text-zinc-500">{sessions} sessão(ões) com comparecimento registrado</p>
      </div>

      {risks > 0 && (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          Há resposta de escala com sinal de risco ainda não vista. <Link href={`/pacientes/${pid}/escalas`} className="underline">Abrir escalas</Link>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {a.meetingUrl && <a href={a.meetingUrl} target="_blank" rel="noopener noreferrer" className={chip}>Abrir o Meet</a>}
        <Link href={`/pacientes/${pid}/prontuario/novo?atendimento=${a.id}`} className="rounded bg-emerald-700 px-3 py-2 text-sm text-white">Novo registro desta consulta</Link>
        <Link href={`/pacientes/${pid}/prontuario`} className={chip}>Prontuário</Link>
        <Link href={`/pacientes/${pid}/linha-do-tempo`} className={chip}>Linha do tempo</Link>
        <Link href={`/pacientes/${pid}/escalas`} className={chip}>Escalas</Link>
        <Link href={`/pacientes/${pid}/plano`} className={chip}>Plano</Link>
        <Link href={`/pacientes/${pid}/tarefas`} className={chip}>
          Tarefas{pendingTasks > 0 ? ` (${pendingTasks} pendente${pendingTasks > 1 ? "s" : ""})` : ""}{newReturns > 0 ? ` · ${newReturns} retorno novo` : ""}
        </Link>
        <Link href={`/agenda/${a.id}`} className={chip}>Consulta</Link>
      </div>

      <section className="space-y-2 rounded-xl border bg-white p-4">
        <h2 className="text-base">Última evolução</h2>
        {last && lastEvolution ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-zinc-700">{fmt(lastEvolution.createdAt)} · {excerpt(last.replace(/\s+/g, " "), 140)}</summary>
            <p className="mt-2 whitespace-pre-wrap text-zinc-800">{last}</p>
            <Link href={`/pacientes/${pid}/prontuario/${lastEvolution.id}`} className="mt-2 inline-block text-xs underline">Abrir registro</Link>
          </details>
        ) : (
          <p className="text-sm text-zinc-500">Nenhuma evolução registrada ainda.</p>
        )}
      </section>

      <section className="space-y-2 rounded-xl border bg-white p-4">
        <h2 className="text-base">Metas do plano</h2>
        {plan && plan.goals.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {plan.goals.map((g) => <li key={g.id}>{decryptField(g.textEnc)} <span className="text-xs text-zinc-500">({g.progress}%)</span></li>)}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">Sem metas em andamento. <Link href={`/pacientes/${pid}/plano`} className="underline">Abrir plano</Link></p>
        )}
      </section>

      <section className="space-y-2 rounded-xl border bg-white p-4">
        <h2 className="text-base">Registros recentes</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum registro.</p>
        ) : (
          <ul className="divide-y text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={`/pacientes/${pid}/prontuario/${r.id}`} className="underline">{RECORD_TYPE_LABEL[r.type]}</Link>
                <span className="text-xs text-zinc-500">{localDate(r.createdAt).split("-").reverse().join("/")} · {r.status === "APROVADO" ? "aprovado" : "rascunho"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
