import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { localDate } from "@/lib/agenda";
import { formatBRL, shiftMonth, validMonth } from "@/lib/money";
import { markCompetencePaidAction, markEntryPaidAction, reopenEntryAction, setInsurerPriceAction, updateInsurerAction } from "@/app/actions/insurance";
import { FinanceTabs } from "@/components/finance-tabs";

export const dynamic = "force-dynamic";

const input = "rounded border bg-white px-3 py-2 text-sm";
const btn = "rounded border px-2 py-1 text-xs";
const STATUS: Record<string, { label: string; style: string }> = {
  A_FATURAR: { label: "A receber", style: "bg-zinc-100 text-zinc-700" },
  PAGO: { label: "Recebido", style: "bg-emerald-100 text-emerald-800" },
  CANCELADO: { label: "Cancelado", style: "bg-zinc-100 text-zinc-400 line-through" },
};
const fmt = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

export default async function InsurerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string; erro?: string; ok?: string }> }) {
  const user = await requireRole("ADMIN", "FINANCEIRO");
  const { id } = await params;
  const sp = await searchParams;
  const today = localDate(new Date());
  const mes = sp.mes && validMonth(sp.mes) ? sp.mes : today.slice(0, 7);

  const insurer = await db.insurer.findFirst({ where: { id, clinicId: user.clinicId }, include: { prices: true } });
  if (!insurer) notFound();
  const [services, entries] = await Promise.all([
    db.service.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" } }),
    db.insuranceEntry.findMany({ where: { clinicId: user.clinicId, insurerId: id, competence: mes }, orderBy: { serviceDate: "asc" } }),
  ]);
  const [patients, appts] = await Promise.all([
    db.patient.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.patientId))] } }, select: { id: true, fullName: true } }),
    db.appointment.findMany({ where: { id: { in: entries.map((e) => e.appointmentId) } }, select: { id: true, service: { select: { name: true } } } }),
  ]);
  const name = new Map(patients.map((p) => [p.id, p.fullName]));
  const svc = new Map(appts.map((a) => [a.id, a.service.name]));
  const price = new Map(insurer.prices.map((p) => [p.serviceId, p.priceCents]));

  const live = entries.filter((e) => e.status !== "CANCELADO");
  const open = live.filter((e) => e.status === "A_FATURAR");
  const sum = (rows: typeof entries) => rows.reduce((t, e) => t + e.amountCents, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/financeiro/convenios" className="text-xs text-zinc-500 underline">← Convênios</Link>
      <h1 className="text-2xl">{insurer.name}</h1>
      <FinanceTabs active="/financeiro/convenios" />
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      {sp.ok && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}

      <section className="space-y-3 rounded border bg-white p-4">
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/financeiro/convenios/${id}?mes=${shiftMonth(mes, -1)}`} className={btn}>←</Link>
          <strong className="min-w-16 text-center">{mes.split("-").reverse().join("/")}</strong>
          <Link href={`/financeiro/convenios/${id}?mes=${shiftMonth(mes, 1)}`} className={btn}>→</Link>
          <span className="text-xs text-zinc-500">competência = mês do atendimento</span>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-xl border p-3"><p className="text-xs text-zinc-500">Atendimentos</p><p className="text-lg font-semibold">{live.length}</p></div>
          <div className="rounded-xl border p-3"><p className="text-xs text-zinc-500">A receber</p><p className="text-lg font-semibold">{formatBRL(sum(open))}</p></div>
          <div className="rounded-xl border p-3"><p className="text-xs text-zinc-500">Recebido</p><p className="text-lg font-semibold text-emerald-700">{formatBRL(sum(live.filter((e) => e.status === "PAGO")))}</p></div>
        </div>
        {open.length > 0 && (
          <form action={markCompetencePaidAction} className="flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="insurerId" value={id} />
            <input type="hidden" name="mes" value={mes} />
            <label className="text-xs">Data do recebimento<input name="date" type="date" defaultValue={today} className={`${input} ml-2`} /></label>
            <button className="rounded bg-emerald-700 px-3 py-2 text-sm text-white">Marcar todos como recebidos ({open.length})</button>
          </form>
        )}
        <ul className="divide-y rounded border text-sm">
          {entries.length === 0 && <li className="p-3 text-zinc-500">Nenhum atendimento do convênio nesta competência.</li>}
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <p className="font-medium">{name.get(e.patientId) ?? "Paciente"}</p>
                <p className="text-xs text-zinc-500">
                  {fmt(e.serviceDate)} · {svc.get(e.appointmentId) ?? "Atendimento"} · previsão {fmt(e.expectedDate)}
                  {e.paidAt && ` · recebido em ${fmt(e.paidAt)}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{formatBRL(e.amountCents)}</span>
                <span className={`rounded px-2 py-0.5 text-xs ${STATUS[e.status]?.style}`}>{STATUS[e.status]?.label ?? e.status}</span>
                {e.status === "A_FATURAR" && (
                  <form action={markEntryPaidAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="date" value={today} />
                    <button className={btn}>Marcar recebido</button>
                  </form>
                )}
                {e.status === "PAGO" && (
                  <form action={reopenEntryAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <button className={btn} title="Volta para a receber">Estornar</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded border bg-white p-4">
        <h2>Valores por serviço</h2>
        <p className="text-xs text-zinc-500">Quanto este convênio paga por atendimento. Serviço sem valor não pode ser agendado por este convênio.</p>
        <ul className="divide-y text-sm">
          {services.map((s) => (
            <li key={s.id}>
              <form action={setInsurerPriceAction} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <input type="hidden" name="insurerId" value={id} />
                <input type="hidden" name="serviceId" value={s.id} />
                <span>{s.name} <span className="text-xs text-zinc-500">(particular {formatBRL(s.priceCents)})</span></span>
                <span className="flex items-center gap-2">
                  <input name="price" defaultValue={price.has(s.id) ? ((price.get(s.id) ?? 0) / 100).toFixed(2).replace(".", ",") : ""} placeholder="sem valor" inputMode="decimal" className={`${input} w-28`} />
                  <button className={btn}>Salvar</button>
                </span>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <form action={updateInsurerAction} className="space-y-3 rounded border bg-white p-4">
        <h2>Dados do convênio</h2>
        <input type="hidden" name="id" value={id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Nome<input name="name" required defaultValue={insurer.name} className={`${input} mt-1 w-full`} /></label>
          <label className="block text-sm">CNPJ<input name="cnpj" defaultValue={insurer.cnpj ?? ""} inputMode="numeric" className={`${input} mt-1 w-full`} /></label>
          <label className="block text-sm">Prazo de pagamento (dias)<input name="paymentDays" type="number" min={0} max={365} defaultValue={insurer.paymentDays} className={`${input} mt-1 w-full`} /></label>
          <label className="block text-sm">Repasse neste convênio (%)<input name="sharePercent" type="number" min={0} max={100} defaultValue={insurer.sharePercent ?? ""} placeholder="vazio = usa o do profissional" className={`${input} mt-1 w-full`} /></label>
        </div>
        <label className="block text-sm">Observações<textarea name="notes" rows={2} defaultValue={insurer.notes ?? ""} className={`${input} mt-1 w-full`} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={insurer.active} /> Convênio ativo (aparece no agendamento)</label>
        <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Salvar</button>
      </form>
    </div>
  );
}
