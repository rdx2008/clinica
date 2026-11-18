import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { createServiceAction } from "@/app/actions/agenda";

export const dynamic = "force-dynamic";

const input = "rounded border px-3 py-2 text-sm";

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const user = await requireRole("ADMIN");
  const { erro } = await searchParams;
  const services = await db.service.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" } });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Serviços</h1>
      <p className="text-sm text-zinc-500">Tipos de atendimento oferecidos (ex.: Psicoterapia individual, Avaliação inicial).</p>
      {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

      <ul className="divide-y rounded border text-sm">
        {services.length === 0 && <li className="p-3 text-zinc-500">Nenhum serviço cadastrado.</li>}
        {services.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span className="font-medium">{s.name}</span>
            <span className="text-zinc-600">
              {s.durationMin} min · {s.modality === "ONLINE" ? "online" : "presencial"} ·{" "}
              {(s.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </span>
          </li>
        ))}
      </ul>

      <form action={createServiceAction} className="flex flex-wrap items-end gap-2 rounded border p-3">
        <label className="text-sm">Nome<br /><input name="name" required className={input} /></label>
        <label className="text-sm">Duração (min)<br /><input name="durationMin" type="number" min={10} max={480} defaultValue={50} required className={`${input} w-28`} /></label>
        <label className="text-sm">Valor (R$)<br /><input name="price" inputMode="decimal" placeholder="150,00" required className={`${input} w-28`} /></label>
        <label className="text-sm">Modalidade<br />
          <select name="modality" className={input}>
            <option value="PRESENCIAL">Presencial</option>
            <option value="ONLINE">Online</option>
          </select>
        </label>
        <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Adicionar</button>
      </form>
    </div>
  );
}
