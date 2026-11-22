import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { canAccessPatient, requireClinician } from "@/lib/clinical";
import { addGoalAction, concludePlanAction, createPlanAction, updateGoalAction } from "@/app/actions/therapy";

export const dynamic = "force-dynamic";

const input = "w-full rounded border px-3 py-2 text-sm";
const STATUS_LABEL: Record<string, string> = { EM_ANDAMENTO: "Em andamento", ALCANCADA: "Alcançada", PAUSADA: "Pausada", ABANDONADA: "Abandonada" };
const STATUS_STYLE: Record<string, string> = { EM_ANDAMENTO: "bg-blue-100 text-blue-800", ALCANCADA: "bg-emerald-100 text-emerald-800", PAUSADA: "bg-amber-100 text-amber-800", ABANDONADA: "bg-zinc-100 text-zinc-600" };
const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { user, professionalId } = await requireClinician();
  const { id } = await params;
  const sp = await searchParams;
  if (!(await canAccessPatient(user.clinicId, professionalId, id))) notFound();

  const [patient, plans] = await Promise.all([
    db.patient.findFirst({ where: { id, clinicId: user.clinicId }, select: { fullName: true } }),
    db.therapyPlan.findMany({
      where: { clinicId: user.clinicId, patientId: id, professionalId },
      orderBy: { createdAt: "desc" },
      include: { goals: { orderBy: { createdAt: "asc" } } },
    }),
  ]);
  if (!patient) notFound();
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PLANO_VISUALIZADO", entity: "Patient", entityId: id });

  const active = plans.find((p) => p.status === "ATIVO");
  const past = plans.filter((p) => p.status !== "ATIVO");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={`/pacientes/${id}/prontuario`} className="text-xs text-zinc-500 underline">← Prontuário de {patient.fullName}</Link>
      <h1 className="text-2xl">Plano terapêutico</h1>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      {active ? (
        <section className="space-y-4 rounded border p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2>Foco do plano</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm">{decryptField(active.focusEnc)}</p>
              <p className="mt-1 text-xs text-zinc-500">Iniciado em {active.createdAt.toLocaleDateString("pt-BR")}</p>
            </div>
            <form action={concludePlanAction}>
              <input type="hidden" name="planId" value={active.id} />
              <button className="rounded border px-3 py-1.5 text-sm">Concluir plano</button>
            </form>
          </div>

          <div className="space-y-3">
            <h2>Metas</h2>
            {active.goals.length === 0 && <p className="text-sm text-zinc-500">Nenhuma meta ainda.</p>}
            {active.goals.map((g) => (
              <form key={g.id} action={updateGoalAction} className="space-y-2 rounded-xl border bg-white p-3">
                <input type="hidden" name="goalId" value={g.id} />
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium">{decryptField(g.textEnc)}</p>
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[g.status]}`}>{STATUS_LABEL[g.status]}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${g.progress}%` }} /></div>
                <p className="text-xs text-zinc-500">{g.progress}%{g.targetDate && ` · prazo ${fmt(g.targetDate)}`}</p>
                {g.noteEnc && <p className="rounded bg-zinc-50 p-2 text-xs text-zinc-700">Último acompanhamento: {decryptField(g.noteEnc)}</p>}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <select name="status" defaultValue={g.status} className="rounded border px-2 py-1">
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <label>Progresso <input name="progress" type="number" min={0} max={100} defaultValue={g.progress} className="w-16 rounded border px-2 py-1" />%</label>
                  <input name="note" placeholder="Acompanhamento (opcional)" className="min-w-[10rem] flex-1 rounded border px-2 py-1" />
                  <button className="rounded border px-2.5 py-1">Atualizar</button>
                </div>
              </form>
            ))}
          </div>

          <form action={addGoalAction} className="grid gap-2 rounded-xl border border-dashed p-3 sm:grid-cols-[1fr_auto_auto]">
            <input type="hidden" name="planId" value={active.id} />
            <input name="text" required placeholder="Nova meta (ex.: reduzir crises de ansiedade em situações de trabalho)" className={input} />
            <input name="targetDate" type="date" className={input} aria-label="Prazo" />
            <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Adicionar meta</button>
          </form>
        </section>
      ) : (
        <section className="space-y-3 rounded border p-5">
          <h2>Criar plano</h2>
          <p className="text-sm text-zinc-600">Descreva o foco do acompanhamento (demanda, hipóteses de trabalho e estratégia). Depois acrescente metas e acompanhe o progresso.</p>
          <form action={createPlanAction} className="space-y-3">
            <input type="hidden" name="patientId" value={id} />
            <textarea name="focus" required rows={5} maxLength={3000} className={input} />
            <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Criar plano</button>
          </form>
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-2">
          <h2>Planos anteriores</h2>
          <ul className="space-y-2 text-sm">
            {past.map((p) => (
              <li key={p.id} className="rounded-xl border bg-white p-3">
                <p className="text-xs text-zinc-500">{p.createdAt.toLocaleDateString("pt-BR")} a {p.updatedAt.toLocaleDateString("pt-BR")}</p>
                <p className="whitespace-pre-wrap">{decryptField(p.focusEnc)}</p>
                <ul className="mt-2 list-disc pl-5 text-xs text-zinc-600">
                  {p.goals.map((g) => <li key={g.id}>{decryptField(g.textEnc)} — {STATUS_LABEL[g.status]} ({g.progress}%)</li>)}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
