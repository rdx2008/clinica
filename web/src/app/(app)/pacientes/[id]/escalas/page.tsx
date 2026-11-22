import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canAccessPatient, requireClinician } from "@/lib/clinical";
import { isScaleKey, SCALES, scoreScale, trend, type ScaleKey } from "@/lib/scales";
import { readScaleData } from "@/lib/scale-data";
import { ackRiskAction, assignScaleAction, cancelScaleAction } from "@/app/actions/scales";

export const dynamic = "force-dynamic";

const TONE = { ok: "bg-emerald-100 text-emerald-800", leve: "bg-amber-100 text-amber-800", moderado: "bg-orange-100 text-orange-800", grave: "bg-red-100 text-red-700" } as const;
const BAR = { ok: "#0f6b5d", leve: "#ca8a04", moderado: "#ea580c", grave: "#dc2626" } as const;
const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function ScalesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { user, professionalId } = await requireClinician();
  const { id } = await params;
  const sp = await searchParams;
  if (!(await canAccessPatient(user.clinicId, professionalId, id))) notFound();

  const [patient, rows] = await Promise.all([
    db.patient.findFirst({ where: { id, clinicId: user.clinicId }, select: { fullName: true, email: true } }),
    db.scaleAssignment.findMany({ where: { clinicId: user.clinicId, patientId: id, professionalId, status: { not: "CANCELADA" } }, orderBy: { sentAt: "asc" } }),
  ]);
  if (!patient) notFound();

  await audit({ clinicId: user.clinicId, userId: user.id, action: "ESCALAS_VISUALIZADAS", entity: "Patient", entityId: id });
  // Resultados abertos contam como vistos.
  await db.scaleAssignment.updateMany({ where: { clinicId: user.clinicId, patientId: id, professionalId, status: "RESPONDIDA", seenAt: null }, data: { seenAt: new Date() } });

  const pending = rows.filter((r) => r.status === "PENDENTE");
  const answered = rows
    .filter((r) => r.status === "RESPONDIDA" && isScaleKey(r.scaleKey))
    .map((r) => {
      const data = readScaleData(r.dataEnc);
      const res = data && isScaleKey(r.scaleKey) ? scoreScale(r.scaleKey as ScaleKey, data.answers) : null;
      return { r, data, res };
    })
    .filter((x) => x.data && x.res);
  const risks = answered.filter((x) => x.r.riskFlag && !x.r.riskAckAt);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={`/pacientes/${id}/prontuario`} className="text-xs text-zinc-500 underline">← Prontuário de {patient.fullName}</Link>
      <h1 className="text-2xl">Escalas</h1>
      <p className="text-sm text-zinc-600">PHQ-9 (depressão) e GAD-7 (ansiedade). São instrumentos de rastreio e acompanhamento: não substituem a avaliação clínica nem fecham diagnóstico.</p>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      {risks.map((x) => (
        <div key={x.r.id} role="alert" className="space-y-2 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">Atenção: resposta com sinal de risco ({SCALES[x.r.scaleKey as ScaleKey].name}, {fmt(x.r.answeredAt ?? x.r.sentAt)})</p>
          <p>O item sobre pensamentos de se ferir ou de que seria melhor estar morto(a) foi marcado. Avalie o paciente o quanto antes e siga o protocolo de risco da clínica.</p>
          <form action={ackRiskAction}>
            <input type="hidden" name="id" value={x.r.id} />
            <button className="rounded border border-red-400 bg-white px-3 py-1.5 text-sm">Estou ciente</button>
          </form>
        </div>
      ))}

      <section className="space-y-3 rounded border p-4">
        <h2>Nova aplicação</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(SCALES) as ScaleKey[]).map((k) => (
            <div key={k} className="space-y-2 rounded-xl border bg-white p-3">
              <p className="font-medium">{SCALES[k].name}</p>
              <p className="text-xs text-zinc-500">{SCALES[k].full}</p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/pacientes/${id}/escalas/aplicar?escala=${k}`} className="rounded border px-3 py-1.5 text-xs">Aplicar agora (na sessão)</Link>
                {patient.email ? (
                  <form action={assignScaleAction}>
                    <input type="hidden" name="patientId" value={id} />
                    <input type="hidden" name="scaleKey" value={k} />
                    <button className="rounded border px-3 py-1.5 text-xs">Enviar pelo portal</button>
                  </form>
                ) : (
                  <span className="text-[11px] text-zinc-400">Sem e-mail para enviar pelo portal</span>
                )}
              </div>
            </div>
          ))}
        </div>
        {pending.length > 0 && (
          <ul className="divide-y text-sm">
            {pending.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <span>{SCALES[p.scaleKey as ScaleKey]?.name ?? p.scaleKey} enviada em {fmt(p.sentAt)} <span className="text-xs text-amber-700">· aguardando resposta no portal</span></span>
                <form action={cancelScaleAction}><input type="hidden" name="id" value={p.id} /><button className="rounded border px-2 py-1 text-xs">Cancelar envio</button></form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(Object.keys(SCALES) as ScaleKey[]).map((k) => {
        const list = answered.filter((x) => x.r.scaleKey === k);
        if (list.length === 0) return null;
        const def = SCALES[k];
        return (
          <section key={k} className="space-y-3 rounded border p-4">
            <h2>{def.name} — evolução</h2>
            <div className="flex h-24 items-end gap-2 rounded-lg bg-zinc-50 p-3" aria-label={`Evolução ${def.name}`}>
              {list.map((x) => (
                <div key={x.r.id} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${fmt(x.r.answeredAt ?? x.r.sentAt)}: ${x.res!.score}`}>
                  <span className="text-[10px] text-zinc-600">{x.res!.score}</span>
                  <div className="w-full max-w-10 rounded-t" style={{ height: `${Math.max(6, (x.res!.score / def.max) * 100)}%`, background: BAR[x.res!.tone] }} />
                </div>
              ))}
            </div>
            <ul className="divide-y text-sm">
              {[...list].reverse().map((x, i, arr) => {
                const prev = arr[i + 1];
                const t = trend(prev ? prev.res!.score : null, x.res!.score);
                return (
                  <li key={x.r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{fmt(x.r.answeredAt ?? x.r.sentAt)} <span className="text-xs text-zinc-500">· {x.r.source === "SESSAO" ? "na sessão" : "pelo portal"}</span></span>
                    <span className="flex items-center gap-2">
                      <strong>{x.res!.score}/{def.max}</strong>
                      <span className={`rounded px-2 py-0.5 text-xs ${TONE[x.res!.tone]}`}>{x.res!.severity}</span>
                      {t && <span className={`text-xs ${t.label === "melhora" ? "text-emerald-700" : t.label === "piora" ? "text-red-700" : "text-zinc-500"}`}>{t.label} ({t.delta > 0 ? "+" : ""}{t.delta})</span>}
                      {x.r.riskFlag && <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">sinal de risco</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
