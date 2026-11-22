import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { formatBRL } from "@/lib/money";
import { createPlanAction, togglePlanAction } from "@/app/actions/packages";
import { FinanceTabs } from "@/components/finance-tabs";

export const dynamic = "force-dynamic";

const input = "w-full rounded border bg-white px-3 py-2 text-sm";

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const user = await requireRole("ADMIN", "FINANCEIRO");
  const sp = await searchParams;
  const [plans, services] = await Promise.all([
    db.packagePlan.findMany({ where: { clinicId: user.clinicId }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.service.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true, priceCents: true } }),
  ]);
  const svc = new Map(services.map((s) => [s.id, s]));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/financeiro/pacotes" className="text-xs text-zinc-500 underline">← Pacotes</Link>
      <h1 className="text-2xl">Modelos de pacote</h1>
      <FinanceTabs active="/financeiro/pacotes" />
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      <p className="text-sm text-zinc-600">
        O catálogo fixa serviço, sessões e preço. A recepção vende escolhendo o modelo (sem digitar valor), e o profissional pode solicitar um pacote para o paciente.
      </p>

      <ul className="divide-y rounded border bg-white text-sm">
        {plans.length === 0 && <li className="p-4 text-zinc-500">Nenhum modelo cadastrado ainda.</li>}
        {plans.map((p) => {
          const s = svc.get(p.serviceId);
          const regular = s ? s.priceCents * p.sessions : 0;
          const save = regular > p.priceCents ? Math.round(((regular - p.priceCents) / regular) * 100) : 0;
          return (
            <li key={p.id} className={`flex flex-wrap items-center justify-between gap-2 p-3 ${p.active ? "" : "opacity-60"}`}>
              <div>
                <p className="font-medium">{p.name}{!p.active && <span className="ml-2 rounded bg-zinc-200 px-2 py-0.5 text-xs">inativo</span>}</p>
                <p className="text-xs text-zinc-500">
                  {s?.name ?? "Serviço removido"} · {p.sessions} sessões · {formatBRL(p.priceCents)} ({formatBRL(Math.round(p.priceCents / p.sessions))}/sessão)
                  {save > 0 && ` · ${save}% de desconto sobre o avulso`}
                  {p.validityDays ? ` · validade ${p.validityDays} dias` : " · sem validade"}
                </p>
              </div>
              <form action={togglePlanAction}>
                <input type="hidden" name="id" value={p.id} />
                <button className="rounded border px-2 py-1 text-xs">{p.active ? "Inativar" : "Reativar"}</button>
              </form>
            </li>
          );
        })}
      </ul>

      <form action={createPlanAction} className="grid gap-3 rounded border bg-white p-4 sm:grid-cols-2">
        <h2 className="sm:col-span-2">Novo modelo</h2>
        <label className="text-sm sm:col-span-2">Nome<input name="name" required placeholder="Ex.: Psicoterapia · 4 sessões" className={input} /></label>
        <label className="text-sm">Serviço
          <select name="serviceId" required defaultValue="" className={input}>
            <option value="" disabled>Selecione…</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({formatBRL(s.priceCents)} / sessão)</option>)}
          </select>
        </label>
        <label className="text-sm">Número de sessões<input name="sessions" type="number" min={2} max={100} defaultValue={4} required className={input} /></label>
        <label className="text-sm">Valor total (R$)<input name="price" required inputMode="decimal" placeholder="560,00" className={input} /></label>
        <label className="text-sm">Validade em dias (opcional)<input name="validityDays" type="number" min={1} max={1095} placeholder="ex.: 90" className={input} /></label>
        <div className="sm:col-span-2"><button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Criar modelo</button></div>
      </form>
    </div>
  );
}
