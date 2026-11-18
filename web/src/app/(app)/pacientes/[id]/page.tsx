import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { ageYears, formatPhoneBR, maskCpf } from "@/lib/br";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import {
  addContactAction,
  addGuardianAction,
  removeContactAction,
  removeGuardianAction,
  setPatientStatusAction,
  setWhatsappOptinAction,
} from "@/app/actions/patients";

export const dynamic = "force-dynamic";

const input = "rounded border px-2 py-1 text-sm";
const btn = "rounded border px-2 py-1 text-xs";

function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export default async function PatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const user = await requireRole("ADMIN", "RECEPCAO", "PROFISSIONAL");
  const { id } = await params;
  const { erro } = await searchParams;

  const p = await db.patient.findFirst({
    where: { id, clinicId: user.clinicId },
    include: {
      guardians: { orderBy: { name: "asc" } },
      contacts: { orderBy: { name: "asc" } },
      consents: { orderBy: { acceptedAt: "desc" } },
    },
  });
  if (!p) notFound();

  // LGPD: acesso a dados pessoais de saúde fica registrado.
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PACIENTE_VISUALIZADO", entity: "Patient", entityId: p.id });

  const cpf = p.cpfEnc ? maskCpf(decryptField(p.cpfEnc)) : null;
  const optinActive = p.consents.some((c) => c.type === "WHATSAPP_OPTIN" && !c.revokedAt);
  const age = p.birthDate ? ageYears(p.birthDate) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/pacientes" className="text-xs text-zinc-500 underline">← Pacientes</Link>
          <h1 className="text-xl font-semibold">
            {p.fullName} {p.status === "INATIVO" && <span className="text-sm font-normal text-zinc-500">(inativo)</span>}
          </h1>
        </div>
        <div className="flex gap-2">
          {user.role === "PROFISSIONAL" && <Link href={`/pacientes/${p.id}/prontuario`} className={btn}>Prontuário</Link>}
          <Link href={`/pacientes/${p.id}/editar`} className={btn}>Editar</Link>
          <form action={setPatientStatusAction}>
            <input type="hidden" name="patientId" value={p.id} />
            <input type="hidden" name="status" value={p.status === "ATIVO" ? "INATIVO" : "ATIVO"} />
            <button className={btn}>{p.status === "ATIVO" ? "Inativar" : "Reativar"}</button>
          </form>
        </div>
      </div>

      {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

      <section className="grid gap-2 rounded border p-4 text-sm sm:grid-cols-2">
        <p><span className="text-zinc-500">Nascimento:</span> {p.birthDate ? `${fmtDate(p.birthDate)} (${age} anos)` : "—"}</p>
        <p><span className="text-zinc-500">CPF:</span> {cpf ?? "—"}</p>
        <p><span className="text-zinc-500">Telefone:</span> {p.phoneE164 ? formatPhoneBR(p.phoneE164) : "—"}</p>
        <p><span className="text-zinc-500">E-mail:</span> {p.email ?? "—"}</p>
        <p><span className="text-zinc-500">Origem:</span> {p.source ?? "—"}</p>
        <p><span className="text-zinc-500">Etiquetas:</span> {p.tags.length ? p.tags.join(", ") : "—"}</p>
      </section>

      <section className="space-y-2 rounded border p-4">
        <h2 className="font-medium">Consentimentos</h2>
        <ul className="space-y-1 text-sm">
          {p.consents.map((c) => (
            <li key={c.id}>
              {c.type === "TRATAMENTO_DADOS" ? "Tratamento de dados" : c.type === "WHATSAPP_OPTIN" ? "Contato por WhatsApp" : c.type}
              {" — "}registrado em {c.acceptedAt.toLocaleDateString("pt-BR")} ({c.version})
              {c.revokedAt && <span className="text-red-600"> · revogado em {c.revokedAt.toLocaleDateString("pt-BR")}</span>}
            </li>
          ))}
        </ul>
        <form action={setWhatsappOptinAction} className="flex items-center gap-2 text-sm">
          <input type="hidden" name="patientId" value={p.id} />
          <input type="hidden" name="grant" value={String(!optinActive)} />
          <span>WhatsApp: <strong>{optinActive ? "autorizado" : "não autorizado"}</strong></span>
          <button className={btn}>{optinActive ? "Revogar autorização" : "Registrar autorização"}</button>
        </form>
      </section>

      <section className="space-y-2 rounded border p-4">
        <h2 className="font-medium">Responsáveis legais</h2>
        {p.guardians.length === 0 && <p className="text-sm text-zinc-500">Nenhum responsável cadastrado.</p>}
        <ul className="space-y-1 text-sm">
          {p.guardians.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-2">
              <span>
                {g.name}{g.relation && ` (${g.relation})`}{g.phone && ` · ${formatPhoneBR(g.phone)}`}{g.isLegalGuardian && " · responsável legal"}
              </span>
              <form action={removeGuardianAction}>
                <input type="hidden" name="patientId" value={p.id} />
                <input type="hidden" name="id" value={g.id} />
                <button className={btn}>Remover</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addGuardianAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="patientId" value={p.id} />
          <input name="name" placeholder="Nome" required className={input} />
          <input name="relation" placeholder="Parentesco" className={input} />
          <input name="phone" placeholder="Telefone" className={input} />
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="legal" /> responsável legal</label>
          <button className={btn}>Adicionar</button>
        </form>
      </section>

      <section className="space-y-2 rounded border p-4">
        <h2 className="font-medium">Contatos autorizados</h2>
        <p className="text-xs text-zinc-500">Pessoas com quem a clínica pode tratar de assuntos administrativos deste paciente.</p>
        {p.contacts.length === 0 && <p className="text-sm text-zinc-500">Nenhum contato autorizado.</p>}
        <ul className="space-y-1 text-sm">
          {p.contacts.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <span>{c.name} · {formatPhoneBR(c.phone)} · {c.scope === "financeiro" ? "financeiro" : "agenda"}</span>
              <form action={removeContactAction}>
                <input type="hidden" name="patientId" value={p.id} />
                <input type="hidden" name="id" value={c.id} />
                <button className={btn}>Remover</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addContactAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="patientId" value={p.id} />
          <input name="name" placeholder="Nome" required className={input} />
          <input name="phone" placeholder="Telefone" required className={input} />
          <select name="scope" className={input}>
            <option value="agenda">Agenda</option>
            <option value="financeiro">Financeiro</option>
          </select>
          <button className={btn}>Adicionar</button>
        </form>
      </section>
    </div>
  );
}
