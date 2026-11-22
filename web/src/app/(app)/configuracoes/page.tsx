import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { formatPhoneBR } from "@/lib/br";
import { professionalColor } from "@/lib/agenda";
import { demoExists } from "@/lib/demo";
import { createDemoAction, removeDemoAction } from "@/app/actions/demo";
import { createRoomAction, removeRoomAction, saveClinicAction, setProfessionalColorAction } from "@/app/actions/settings";

export const dynamic = "force-dynamic";

const input = "w-full rounded border px-3 py-2 text-sm";
const btn = "rounded border px-2 py-1 text-xs";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const admin = await requireRole("ADMIN");
  const sp = await searchParams;
  const hasDemo = await demoExists(admin.clinicId);
  const [clinic, rooms, professionals] = await Promise.all([
    db.clinic.findUniqueOrThrow({ where: { id: admin.clinicId } }),
    db.room.findMany({ where: { clinicId: admin.clinicId }, orderBy: { name: "asc" }, include: { _count: { select: { appointments: true } } } }),
    db.professional.findMany({ where: { clinicId: admin.clinicId }, include: { user: { select: { name: true } } }, orderBy: { user: { name: "asc" } } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl">Configurações</h1>
        <p className="text-sm text-zinc-600">Dados da clínica, salas e cores da agenda.</p>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      {sp.ok && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}

      <section className="space-y-3 rounded border p-5">
        <h2>Dados da clínica</h2>
        <form action={saveClinicAction} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">Nome
            <input name="name" required defaultValue={clinic.name} className={input} />
          </label>
          <label className="text-sm">CNPJ
            <input name="cnpj" inputMode="numeric" defaultValue={clinic.cnpj ?? ""} placeholder="somente números" className={input} />
          </label>
          <label className="text-sm">Telefone
            <input name="phone" defaultValue={clinic.phone ? formatPhoneBR(clinic.phone) : ""} placeholder="(11) 3456-7890" className={input} />
          </label>
          <label className="text-sm sm:col-span-2">E-mail de contato
            <input name="email" type="email" defaultValue={clinic.email ?? ""} className={input} />
          </label>
          <label className="text-sm sm:col-span-2">Endereço
            <input name="address" defaultValue={clinic.address ?? ""} placeholder="Rua, número, bairro, cidade/UF" className={input} />
          </label>
          <div className="sm:col-span-2">
            <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Salvar</button>
          </div>
        </form>
        <p className="text-xs text-zinc-500">Esses dados aparecem em recibos e documentos impressos.</p>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded border p-5">
        <div>
          <h2>Pagamentos e nota fiscal</h2>
          <p className="text-sm text-zinc-600">Pix com QR Code e emissão de NFS-e (nota de serviço) pelo Asaas.</p>
        </div>
        <a href="/configuracoes/pagamentos" className="rounded border px-4 py-2 text-sm">Configurar</a>
      </section>

      <section className="space-y-3 rounded border p-5">
        <h2>Salas</h2>
        <ul className="divide-y text-sm">
          {rooms.length === 0 && <li className="py-2 text-zinc-500">Nenhuma sala. Cadastre para evitar dois atendimentos na mesma sala.</li>}
          {rooms.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-2">
              <span>{r.name} <span className="text-xs text-zinc-500">· {r._count.appointments} atendimentos</span></span>
              <form action={removeRoomAction}>
                <input type="hidden" name="id" value={r.id} />
                <button className={btn}>Remover</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={createRoomAction} className="flex gap-2">
          <input name="name" required placeholder="Ex.: Sala 1" className="flex-1 rounded border px-3 py-2 text-sm" />
          <button className="rounded border px-3 py-2 text-sm">Adicionar sala</button>
        </form>
      </section>

      <section className="space-y-3 rounded border p-5">
        <h2>Cor de cada profissional na agenda</h2>
        {professionals.length === 0 && <p className="text-sm text-zinc-500">Nenhum profissional cadastrado.</p>}
        <ul className="divide-y text-sm">
          {professionals.map((p, i) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full" style={{ background: professionalColor(p.color, i) }} />
                {p.user.name}
              </span>
              <form action={setProfessionalColorAction} className="flex items-center gap-2">
                <input type="hidden" name="id" value={p.id} />
                <input type="color" name="color" defaultValue={professionalColor(p.color, i)} className="h-8 w-10 cursor-pointer rounded border p-0.5" aria-label={`Cor de ${p.user.name}`} />
                <button className={btn}>Salvar</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded border p-5">
        <h2>Dados de demonstração</h2>
        <p className="text-sm text-zinc-600">
          Cria profissionais, pacientes, agenda, cobranças, despesas e conversas de exemplo para você conhecer o sistema. Tudo fica marcado como demonstração e pode ser removido de uma vez, sem afetar dados reais.
        </p>
        {hasDemo ? (
          <form action={removeDemoAction}>
            <button className="rounded border border-red-300 px-4 py-2 text-sm text-red-700">Remover dados de demonstração</button>
          </form>
        ) : (
          <form action={createDemoAction}>
            <button className="rounded border px-4 py-2 text-sm">Criar dados de demonstração</button>
          </form>
        )}
      </section>
    </div>
  );
}
