import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { WEEKDAYS } from "@/lib/agenda";
import { addAvailabilityAction, removeAvailabilityAction } from "@/app/actions/agenda";

export const dynamic = "force-dynamic";

const input = "rounded border px-2 py-1 text-sm";
const btn = "rounded border px-2 py-1 text-xs";

export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<{ prof?: string; erro?: string }> }) {
  const user = await requireRole("ADMIN", "RECEPCAO", "PROFISSIONAL");
  const sp = await searchParams;
  const professionals = await db.professional.findMany({
    where: { clinicId: user.clinicId, ...(user.role === "PROFISSIONAL" ? { userId: user.id } : {}) },
    include: { user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const selected = professionals.find((p) => p.id === sp.prof) ?? professionals[0];

  const rows = selected
    ? await db.availability.findMany({ where: { professionalId: selected.id }, orderBy: [{ weekday: "asc" }, { startTime: "asc" }] })
    : [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/agenda" className="text-xs text-zinc-500 underline">← Agenda</Link>
      <h1 className="text-xl font-semibold">Horários de atendimento</h1>
      {sp.erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      {!selected && <p className="text-sm text-zinc-500">Nenhum profissional cadastrado.</p>}
      {selected && (
        <>
          {professionals.length > 1 && (
            <form className="flex items-center gap-2 text-sm">
              <select name="prof" defaultValue={selected.id} className={input}>
                {professionals.map((p) => <option key={p.id} value={p.id}>{p.user.name}</option>)}
              </select>
              <button className={btn}>Ver</button>
            </form>
          )}
          <p className="text-sm text-zinc-600">
            {selected.user.name}: {rows.length === 0 ? "sem horários cadastrados (a agenda não é restringida)." : "agendamentos fora destes horários exigem marcar \"Encaixe\"."}
          </p>
          <ul className="divide-y rounded border text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 p-3">
                <span>{WEEKDAYS[r.weekday]} · {r.startTime}–{r.endTime}</span>
                <form action={removeAvailabilityAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className={btn}>Remover</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addAvailabilityAction} className="flex flex-wrap items-center gap-2 rounded border p-3">
            <input type="hidden" name="professionalId" value={selected.id} />
            <select name="weekday" defaultValue="1" className={input}>
              {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
            <input type="time" name="startTime" defaultValue="08:00" required className={input} />
            <input type="time" name="endTime" defaultValue="12:00" required className={input} />
            <button className="rounded bg-emerald-700 px-3 py-1 text-sm text-white">Adicionar</button>
          </form>
        </>
      )}
    </div>
  );
}
