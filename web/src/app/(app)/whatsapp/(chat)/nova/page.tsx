import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { formatPhoneBR } from "@/lib/br";
import { sendTemplateManualAction } from "@/app/actions/whatsapp2";

export const dynamic = "force-dynamic";

const input = "w-full rounded border px-3 py-2 text-sm";

export default async function NewMessagePage({ searchParams }: { searchParams: Promise<{ patient?: string; q?: string; erro?: string }> }) {
  const user = await requireRole("ADMIN", "RECEPCAO");
  const sp = await searchParams;
  const term = (sp.q ?? "").trim();

  const [templates, patients, preset] = await Promise.all([
    db.waTemplate.findMany({ where: { clinicId: user.clinicId, status: "APROVADO" }, orderBy: { name: "asc" } }),
    db.patient.findMany({
      where: { clinicId: user.clinicId, status: "ATIVO", phoneE164: { not: null }, ...(term ? { fullName: { contains: term, mode: "insensitive" } } : {}) },
      orderBy: { fullName: "asc" },
      take: 50,
      select: { id: true, fullName: true, phoneE164: true },
    }),
    sp.patient ? db.patient.findFirst({ where: { id: sp.patient, clinicId: user.clinicId }, select: { id: true, fullName: true, phoneE164: true } }) : null,
  ]);
  const list = preset && !patients.some((p) => p.id === preset.id) ? [preset, ...patients] : patients;

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 sm:p-6">
      <Link href="/whatsapp" className="text-xs text-zinc-500 underline">← Conversas</Link>
      <div>
        <h1 className="text-2xl">Nova mensagem</h1>
        <p className="text-sm text-zinc-600">Envie um modelo aprovado para iniciar ou retomar uma conversa. Só para pacientes com autorização de WhatsApp.</p>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      {templates.length === 0 ? (
        <p className="rounded border p-4 text-sm text-zinc-600">
          Nenhum modelo aprovado. {user.role === "ADMIN" ? <Link href="/configuracoes/whatsapp/modelos" className="underline">Cadastre ou sincronize modelos</Link> : "Peça ao administrador."}
        </p>
      ) : (
        <>
          <form className="flex gap-2">
            {sp.patient && <input type="hidden" name="patient" value={sp.patient} />}
            <input name="q" defaultValue={term} placeholder="Buscar paciente pelo nome" className="flex-1 rounded border px-3 py-2 text-sm" />
            <button className="rounded border px-3 py-2 text-sm">Buscar</button>
          </form>
          <form action={sendTemplateManualAction} className="space-y-3">
            <label className="block text-sm">Paciente
              <select name="patientId" required defaultValue={preset?.id ?? ""} className={input}>
                <option value="" disabled>Selecione…</option>
                {list.map((p) => <option key={p.id} value={p.id}>{p.fullName} · {p.phoneE164 ? formatPhoneBR(p.phoneE164) : ""}</option>)}
              </select>
            </label>
            <label className="block text-sm">Modelo
              <select name="templateId" required defaultValue="" className={input}>
                <option value="" disabled>Selecione…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <ul className="space-y-1 text-xs text-zinc-500">
              {templates.map((t) => <li key={t.id}><strong>{t.name}:</strong> {t.body}</li>)}
            </ul>
            <p className="text-xs text-zinc-500">As variáveis (nome, data, horário, profissional) são preenchidas com o próximo atendimento do paciente.</p>
            <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Enviar</button>
          </form>
        </>
      )}
    </div>
  );
}
