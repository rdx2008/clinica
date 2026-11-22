import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { decryptField } from "@/lib/crypto";
import { localDate } from "@/lib/agenda";
import { addAuthorizationAction, addPatientInsuranceAction, togglePatientInsuranceAction } from "@/app/actions/insurance";

export const dynamic = "force-dynamic";

const input = "rounded border bg-white px-3 py-2 text-sm";
const btn = "rounded border px-2 py-1 text-xs";
const fmt = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");
const mask = (card: string) => (card.length > 4 ? `${"•".repeat(Math.min(card.length - 4, 8))}${card.slice(-4)}` : card);

export default async function PatientInsurancePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const user = await requireRole("ADMIN", "RECEPCAO");
  const { id } = await params;
  const sp = await searchParams;
  const patient = await db.patient.findFirst({ where: { id, clinicId: user.clinicId }, select: { fullName: true } });
  if (!patient) notFound();
  const today = new Date(`${localDate(new Date())}T00:00:00.000Z`);

  const [plans, insurers] = await Promise.all([
    db.patientInsurance.findMany({
      where: { clinicId: user.clinicId, patientId: id },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      include: { insurer: { select: { name: true } }, authorizations: { orderBy: { createdAt: "desc" } } },
    }),
    db.insurer.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const authIds = plans.flatMap((p) => p.authorizations.map((a) => a.id));
  const usedRows = authIds.length
    ? await db.appointment.groupBy({ by: ["authorizationId"], where: { authorizationId: { in: authIds }, status: { in: ["AGENDADA", "CONFIRMADA", "COMPARECEU"] } }, _count: true })
    : [];
  const used = new Map(usedRows.map((r) => [r.authorizationId, r._count]));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/pacientes/${id}`} className="text-xs text-zinc-500 underline">← {patient.fullName}</Link>
      <h1 className="text-2xl">Convênios</h1>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <ul className="space-y-3">
        {plans.length === 0 && <li className="rounded border bg-white p-4 text-sm text-zinc-500">Nenhuma carteirinha cadastrada. O paciente é atendido como particular.</li>}
        {plans.map((pl) => {
          let card = "";
          try { card = decryptField(pl.cardEnc); } catch { card = ""; }
          const expired = pl.validUntil && pl.validUntil < today;
          return (
            <li key={pl.id} className={`space-y-3 rounded border bg-white p-4 ${pl.active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{pl.insurer.name}{pl.planName ? ` · ${pl.planName}` : ""}</p>
                  <p className="text-xs text-zinc-500">
                    Carteirinha {mask(card)}
                    {pl.validUntil && <> · validade {fmt(pl.validUntil)}{expired && <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-red-700">vencida</span>}</>}
                    {!pl.active && " · inativa"}
                  </p>
                </div>
                <form action={togglePatientInsuranceAction}>
                  <input type="hidden" name="id" value={pl.id} />
                  <button className={btn}>{pl.active ? "Inativar" : "Reativar"}</button>
                </form>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Autorizações</p>
                {pl.authorizations.length === 0 ? (
                  <p className="text-xs text-zinc-500">Sem autorização cadastrada: o agendamento não controla limite de sessões.</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {pl.authorizations.map((a) => {
                      const u = used.get(a.id) ?? 0;
                      const aExpired = a.validUntil && a.validUntil < today;
                      return (
                        <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                          <span>{a.code}{a.validUntil && <span className="text-xs text-zinc-500"> · até {fmt(a.validUntil)}</span>}</span>
                          <span className={`rounded px-2 py-0.5 text-xs ${u >= a.sessionsTotal || aExpired ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                            {u} de {a.sessionsTotal} sessões{aExpired ? " · vencida" : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {pl.active && (
                  <form action={addAuthorizationAction} className="flex flex-wrap items-end gap-2 pt-2 text-xs">
                    <input type="hidden" name="patientInsuranceId" value={pl.id} />
                    <label>Código<input name="code" required className={`${input} ml-1 w-32`} /></label>
                    <label>Sessões<input name="sessions" type="number" min={1} max={200} required className={`${input} ml-1 w-20`} /></label>
                    <label>Validade<input name="validUntil" type="date" className={`${input} ml-1`} /></label>
                    <button className={btn}>Adicionar autorização</button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {insurers.length === 0 ? (
        <p className="rounded border bg-white p-4 text-sm text-zinc-600">
          Nenhum convênio ativo na clínica. {user.role === "ADMIN" ? <Link href="/financeiro/convenios" className="underline">Cadastrar convênio</Link> : "O administrador ou financeiro cadastra em Financeiro → Convênios."}
        </p>
      ) : (
        <form action={addPatientInsuranceAction} className="space-y-3 rounded border bg-white p-4">
          <h2>Nova carteirinha</h2>
          <input type="hidden" name="patientId" value={id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">Convênio
              <select name="insurerId" required defaultValue="" className={`${input} mt-1 w-full`}>
                <option value="" disabled>Selecione…</option>
                {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">Plano (opcional)<input name="planName" className={`${input} mt-1 w-full`} /></label>
            <label className="block text-sm">Número da carteirinha<input name="card" required autoComplete="off" className={`${input} mt-1 w-full`} /></label>
            <label className="block text-sm">Validade (opcional)<input name="validUntil" type="date" className={`${input} mt-1 w-full`} /></label>
          </div>
          <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Salvar carteirinha</button>
          <p className="text-xs text-zinc-500">O número é guardado criptografado e exibido parcialmente.</p>
        </form>
      )}
    </div>
  );
}
