import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { localDate } from "@/lib/agenda";
import { createChargeAction } from "@/app/actions/finance";

export const dynamic = "force-dynamic";

const input = "w-full rounded border px-3 py-2 text-sm";

export default async function NewChargePage({ searchParams }: { searchParams: Promise<{ erro?: string; q?: string }> }) {
  const user = await requireRole("ADMIN", "FINANCEIRO", "RECEPCAO");
  const sp = await searchParams;
  const term = (sp.q ?? "").trim();
  const patients = await db.patient.findMany({
    where: { clinicId: user.clinicId, status: "ATIVO", ...(term ? { fullName: { contains: term, mode: "insensitive" } } : {}) },
    orderBy: { fullName: "asc" },
    take: 50,
    select: { id: true, fullName: true },
  });

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/financeiro" className="text-xs text-zinc-500 underline">← Financeiro</Link>
      <h1 className="text-xl font-semibold">Nova cobrança</h1>
      {sp.erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <form className="flex gap-2">
        <input name="q" defaultValue={term} placeholder="Buscar paciente pelo nome" className="flex-1 rounded border px-3 py-2 text-sm" />
        <button className="rounded border px-3 py-2 text-sm">Buscar</button>
      </form>

      <form action={createChargeAction} className="space-y-3">
        <label className="block text-sm">Paciente
          <select name="patientId" required defaultValue="" className={input}>
            <option value="" disabled>Selecione…</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
        </label>
        <label className="block text-sm">Valor (R$)
          <input name="amount" required inputMode="decimal" placeholder="150,00" className={input} />
        </label>
        <label className="block text-sm">Vencimento
          <input name="due" type="date" required defaultValue={localDate(new Date())} className={input} />
        </label>
        <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Criar cobrança</button>
      </form>
    </div>
  );
}
