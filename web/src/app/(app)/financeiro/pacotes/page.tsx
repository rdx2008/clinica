import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { formatBRL } from "@/lib/money";
import { createPackageAction } from "@/app/actions/finance2";
import { declineRequestAction, sellPlanAction } from "@/app/actions/packages";
import { FinanceTabs } from "@/components/finance-tabs";

export const dynamic = "force-dynamic";

const input = "w-full rounded border px-3 py-2 text-sm";

export default async function PackagesPage({ searchParams }: { searchParams: Promise<{ erro?: string; q?: string; paciente?: string; plano?: string; pedido?: string }> }) {
  const user = await requireRole("ADMIN", "FINANCEIRO", "RECEPCAO");
  const sp = await searchParams;
  const term = (sp.q ?? "").trim();

  const canConfigure = user.role !== "RECEPCAO";
  const [packages, services, patients, plans, requests] = await Promise.all([
    db.package.findMany({
      where: { clinicId: user.clinicId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { patient: { select: { fullName: true } }, service: { select: { name: true } } },
    }),
    db.service.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true, priceCents: true } }),
    db.patient.findMany({
      where: { clinicId: user.clinicId, status: "ATIVO", ...(term ? { fullName: { contains: term, mode: "insensitive" } } : {}) },
      orderBy: { fullName: "asc" },
      take: 50,
      select: { id: true, fullName: true },
    }),
    db.packagePlan.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: { name: "asc" } }),
    db.packageRequest.findMany({ where: { clinicId: user.clinicId, status: "PENDENTE" }, orderBy: { createdAt: "asc" }, take: 30 }),
  ]);
  const [reqPatients, reqProfs] = await Promise.all([
    db.patient.findMany({ where: { id: { in: requests.map((r) => r.patientId) } }, select: { id: true, fullName: true } }),
    db.professional.findMany({ where: { id: { in: requests.map((r) => r.professionalId) } }, include: { user: { select: { name: true } } } }),
  ]);
  const patientName = new Map(reqPatients.map((p) => [p.id, p.fullName]));
  const profName = new Map(reqProfs.map((p) => [p.id, p.user.name]));
  const planOf = new Map(plans.map((p) => [p.id, p]));
  const presetPatient = sp.paciente && !patients.some((p) => p.id === sp.paciente) ? await db.patient.findFirst({ where: { id: sp.paciente, clinicId: user.clinicId, status: "ATIVO" }, select: { id: true, fullName: true } }) : null;
  const patientOptions = presetPatient ? [presetPatient, ...patients] : patients;
  const active = packages.filter((p) => p.sessionsUsed < p.sessionsTotal);
  const done = packages.filter((p) => p.sessionsUsed >= p.sessionsTotal);

  const row = (p: (typeof packages)[number]) => {
    const pct = Math.round((p.sessionsUsed / p.sessionsTotal) * 100);
    return (
      <li key={p.id} className="space-y-1.5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">{p.patient.fullName} <span className="text-xs font-normal text-zinc-500">· {p.service.name}</span></span>
          <span className="text-xs text-zinc-600">{formatBRL(p.priceCents)} · {p.sessionsUsed}/{p.sessionsTotal} sessões{p.validUntil ? ` · até ${p.validUntil.toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : ""}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
        </div>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl">Financeiro</h1>
      <FinanceTabs active="/financeiro/pacotes" limited={user.role === "RECEPCAO"} />
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      <p className="text-sm text-zinc-600">
        Pacotes de sessões vendidos pelo catálogo de modelos. Cada comparecimento registrado na agenda consome uma sessão do pacote do mesmo serviço, e esses atendimentos não geram nova cobrança.
      </p>

      {requests.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-amber-900">Pedidos de profissionais ({requests.length})</h2>
          <ul className="divide-y divide-amber-200 text-sm">
            {requests.map((r) => {
              const plan = planOf.get(r.planId);
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <strong>{patientName.get(r.patientId) ?? "Paciente"}</strong> · {plan?.name ?? "Modelo inativo"}
                    <span className="block text-xs text-amber-900/80">pedido por {profName.get(r.professionalId) ?? "profissional"}{r.note ? ` · "${r.note}"` : ""}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {plan && <Link href={`/financeiro/pacotes?paciente=${r.patientId}&plano=${plan.id}&pedido=${r.id}#vender`} className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white">Vender</Link>}
                    <form action={declineRequestAction}><input type="hidden" name="id" value={r.id} /><button className="rounded border px-3 py-1.5 text-xs">Recusar</button></form>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2>Em andamento ({active.length})</h2>
        <ul className="divide-y rounded border text-sm">
          {active.length === 0 && <li className="p-4 text-zinc-500">Nenhum pacote em andamento.</li>}
          {active.map(row)}
        </ul>
      </section>

      <section id="vender" className="space-y-3 rounded border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2>Vender pacote</h2>
          {canConfigure && <Link href="/financeiro/pacotes/modelos" className="text-sm text-emerald-700 underline">Gerenciar modelos</Link>}
        </div>
        <form className="flex gap-2">
          <input name="q" defaultValue={term} placeholder="Buscar paciente pelo nome" className="flex-1 rounded border px-3 py-2 text-sm" />
          <button className="rounded border px-3 py-2 text-sm">Buscar</button>
        </form>
        {plans.length === 0 ? (
          <p className="text-sm text-zinc-600">Nenhum modelo de pacote cadastrado. {canConfigure ? <Link href="/financeiro/pacotes/modelos" className="underline">Criar modelos</Link> : "Peça ao financeiro para cadastrar os modelos."}</p>
        ) : (
          <form action={sellPlanAction} className="grid gap-3 sm:grid-cols-2">
            {sp.pedido && <input type="hidden" name="requestId" value={sp.pedido} />}
            <label className="text-sm sm:col-span-2">Paciente
              <select name="patientId" required defaultValue={sp.paciente ?? ""} className={input}>
                <option value="" disabled>Selecione…</option>
                {patientOptions.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">Pacote
              <select name="planId" required defaultValue={sp.plano ?? ""} className={input}>
                <option value="" disabled>Selecione…</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sessions} sessões · {formatBRL(p.priceCents)}</option>)}
              </select>
            </label>
            <label className="text-sm">Forma de pagamento (se já pago)
              <select name="method" defaultValue="PIX" className={input}>
                <option value="PIX">Pix</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="CARTAO">Cartão</option>
                <option value="TRANSFERENCIA">Transferência</option>
                <option value="OUTRO">Outro</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="paidNow" /> Pagamento recebido agora</label>
            <div className="sm:col-span-2"><button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Vender pacote</button></div>
          </form>
        )}

        {canConfigure && (
          <details className="rounded border p-3">
            <summary className="cursor-pointer text-sm font-medium">Venda avulsa com valor personalizado</summary>
            <form action={createPackageAction} className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2">Paciente
                <select name="patientId" required defaultValue="" className={input}>
                  <option value="" disabled>Selecione…</option>
                  {patientOptions.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                </select>
              </label>
              <label className="text-sm">Serviço
                <select name="serviceId" required defaultValue="" className={input}>
                  <option value="" disabled>Selecione…</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({formatBRL(s.priceCents)} / sessão)</option>)}
                </select>
              </label>
              <label className="text-sm">Número de sessões
                <input name="sessions" type="number" min={2} max={100} defaultValue={4} required className={input} />
              </label>
              <label className="text-sm">Valor total do pacote (R$)
                <input name="price" required inputMode="decimal" placeholder="560,00" className={input} />
              </label>
              <label className="text-sm">Forma de pagamento (se já pago)
                <select name="method" defaultValue="PIX" className={input}>
                  <option value="PIX">Pix</option>
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="CARTAO">Cartão</option>
                  <option value="TRANSFERENCIA">Transferência</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="paidNow" /> Pagamento recebido agora</label>
              <div className="sm:col-span-2"><button className="rounded border px-4 py-2 text-sm">Vender com valor personalizado</button></div>
            </form>
          </details>
        )}
      </section>

      {done.length > 0 && (
        <section className="space-y-2">
          <h2>Concluídos ({done.length})</h2>
          <ul className="divide-y rounded border text-sm">{done.slice(0, 20).map(row)}</ul>
        </section>
      )}
    </div>
  );
}
