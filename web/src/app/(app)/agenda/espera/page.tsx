import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { addWaitlistAction, setWaitlistStatusAction } from "@/app/actions/waitlist";

export const dynamic = "force-dynamic";

const input = "w-full rounded border px-3 py-2 text-sm";
const btn = "rounded border px-2 py-1 text-xs";

export default async function WaitlistPage({ searchParams }: { searchParams: Promise<{ erro?: string; q?: string }> }) {
  const user = await requireRole("ADMIN", "RECEPCAO");
  const sp = await searchParams;
  const term = (sp.q ?? "").trim();

  const [entries, professionals, services, patients] = await Promise.all([
    db.waitlistEntry.findMany({
      where: { clinicId: user.clinicId, status: "ABERTA" },
      orderBy: { createdAt: "asc" },
      include: { patient: { select: { id: true, fullName: true, phoneE164: true } } },
    }),
    db.professional.findMany({ where: { clinicId: user.clinicId, user: { active: true } }, include: { user: { select: { name: true } } }, orderBy: { user: { name: "asc" } } }),
    db.service.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.patient.findMany({
      where: { clinicId: user.clinicId, status: "ATIVO", ...(term ? { fullName: { contains: term, mode: "insensitive" } } : {}) },
      orderBy: { fullName: "asc" },
      take: 50,
      select: { id: true, fullName: true },
    }),
  ]);
  const profName = new Map(professionals.map((p) => [p.id, p.user.name]));
  const svcName = new Map(services.map((s) => [s.id, s.name]));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/agenda/semana" className="text-xs text-zinc-500 underline">← Agenda</Link>
        <h1 className="text-2xl">Lista de espera</h1>
        <p className="text-sm text-zinc-600">Pacientes aguardando um horário. Quando abrir uma vaga, agende direto daqui.</p>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <ul className="divide-y rounded border text-sm">
        {entries.length === 0 && <li className="p-4 text-zinc-500">Ninguém na lista de espera.</li>}
        {entries.map((e, i) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div>
              <p className="font-medium">
                <span className="mr-2 text-xs text-zinc-400">#{i + 1}</span>
                <Link href={`/pacientes/${e.patient.id}`} className="underline">{e.patient.fullName}</Link>
              </p>
              <p className="text-xs text-zinc-500">
                desde {e.createdAt.toLocaleDateString("pt-BR")}
                {e.professionalId && ` · ${profName.get(e.professionalId) ?? ""}`}
                {e.serviceId && ` · ${svcName.get(e.serviceId) ?? ""}`}
                {e.preference && ` · prefere: ${e.preference}`}
              </p>
              {e.notes && <p className="text-xs text-zinc-600">{e.notes}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/agenda/novo?patient=${e.patient.id}${e.professionalId ? `&prof=${e.professionalId}` : ""}`} className="rounded bg-emerald-700 px-2.5 py-1 text-xs text-white">Agendar</Link>
              <form action={setWaitlistStatusAction}>
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="status" value="ATENDIDA" />
                <button className={btn}>Já atendido</button>
              </form>
              <form action={setWaitlistStatusAction}>
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="status" value="REMOVIDA" />
                <button className={btn}>Remover</button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      <section className="space-y-3 rounded border p-4">
        <h2>Adicionar à lista</h2>
        <form className="flex gap-2">
          <input name="q" defaultValue={term} placeholder="Buscar paciente pelo nome" className="flex-1 rounded border px-3 py-2 text-sm" />
          <button className="rounded border px-3 py-2 text-sm">Buscar</button>
        </form>
        <form action={addWaitlistAction} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">Paciente
            <select name="patientId" required defaultValue="" className={input}>
              <option value="" disabled>Selecione…</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </select>
          </label>
          <label className="text-sm">Profissional (opcional)
            <select name="professionalId" defaultValue="" className={input}>
              <option value="">Qualquer</option>
              {professionals.map((p) => <option key={p.id} value={p.id}>{p.user.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Serviço (opcional)
            <select name="serviceId" defaultValue="" className={input}>
              <option value="">Qualquer</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">Preferência de dias e horários
            <input name="preference" placeholder="Ex.: terças e quintas à tarde" className={input} />
          </label>
          <label className="text-sm sm:col-span-2">Observações
            <input name="notes" className={input} />
          </label>
          <div className="sm:col-span-2">
            <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Adicionar</button>
          </div>
        </form>
      </section>
    </div>
  );
}
