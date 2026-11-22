import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { formatBRL } from "@/lib/money";
import { createPackageAction } from "@/app/actions/finance2";
import { FinanceTabs } from "@/components/finance-tabs";

export const dynamic = "force-dynamic";

const input = "w-full rounded border px-3 py-2 text-sm";

export default async function PackagesPage({ searchParams }: { searchParams: Promise<{ erro?: string; q?: string }> }) {
  const user = await requireRole("ADMIN", "FINANCEIRO", "RECEPCAO");
  const sp = await searchParams;
  const term = (sp.q ?? "").trim();

  const [packages, services, patients] = await Promise.all([
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
  ]);
  const active = packages.filter((p) => p.sessionsUsed < p.sessionsTotal);
  const done = packages.filter((p) => p.sessionsUsed >= p.sessionsTotal);

  const row = (p: (typeof packages)[number]) => {
    const pct = Math.round((p.sessionsUsed / p.sessionsTotal) * 100);
    return (
      <li key={p.id} className="space-y-1.5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">{p.patient.fullName} <span className="text-xs font-normal text-zinc-500">· {p.service.name}</span></span>
          <span className="text-xs text-zinc-600">{formatBRL(p.priceCents)} · {p.sessionsUsed}/{p.sessionsTotal} sessões</span>
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
        Venda de pacotes de sessões. Cada comparecimento registrado na agenda consome uma sessão do pacote do mesmo serviço, e esses atendimentos não geram nova cobrança.
      </p>

      <section className="space-y-2">
        <h2>Em andamento ({active.length})</h2>
        <ul className="divide-y rounded border text-sm">
          {active.length === 0 && <li className="p-4 text-zinc-500">Nenhum pacote em andamento.</li>}
          {active.map(row)}
        </ul>
      </section>

      <section className="space-y-3 rounded border p-4">
        <h2>Vender pacote</h2>
        <form className="flex gap-2">
          <input name="q" defaultValue={term} placeholder="Buscar paciente pelo nome" className="flex-1 rounded border px-3 py-2 text-sm" />
          <button className="rounded border px-3 py-2 text-sm">Buscar</button>
        </form>
        <form action={createPackageAction} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">Paciente
            <select name="patientId" required defaultValue="" className={input}>
              <option value="" disabled>Selecione…</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
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
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="paidNow" /> Pagamento recebido agora
          </label>
          <div className="sm:col-span-2">
            <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Vender pacote</button>
          </div>
        </form>
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
