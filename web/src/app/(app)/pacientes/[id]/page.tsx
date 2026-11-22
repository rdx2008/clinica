import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { ageYears, formatPhoneBR, maskCpf } from "@/lib/br";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { localDate, localTime, nowPlus, STATUS_LABEL } from "@/lib/agenda";
import { effectiveStatus, formatBRL } from "@/lib/money";
import {
  addContactAction,
  addGuardianAction,
  removeContactAction,
  removeGuardianAction,
  setPatientStatusAction,
  setWhatsappOptinAction,
} from "@/app/actions/patients";
import { anonymizePatientAction } from "@/app/actions/patients-admin";
import { PortalLink } from "./portal-link";
import { acceptTermInPersonAction } from "@/app/actions/terms";

export const dynamic = "force-dynamic";

const input = "rounded border px-2 py-1 text-sm";
const btn = "rounded border px-2 py-1 text-xs";
const SEX = { F: "Feminino", M: "Masculino", O: "Outro" } as const;

function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

const STATUS_STYLE: Record<string, string> = {
  AGENDADA: "bg-zinc-100 text-zinc-700",
  CONFIRMADA: "bg-emerald-100 text-emerald-800",
  COMPARECEU: "bg-blue-100 text-blue-800",
  FALTOU: "bg-amber-100 text-amber-800",
  CANCELADA: "bg-red-100 text-red-700",
  REMARCADA: "bg-zinc-100 text-zinc-500",
};

export default async function PatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; aba?: string }>;
}) {
  const user = await requireRole("ADMIN", "RECEPCAO", "PROFISSIONAL");
  const { id } = await params;
  const sp = await searchParams;
  const canFinance = user.role !== "PROFISSIONAL";
  const aba = ["resumo", "atendimentos", "financeiro", "dados"].includes(sp.aba ?? "") ? (sp.aba as string) : "resumo";

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

  const now = nowPlus(0);
  const [appointments, charges] = await Promise.all([
    db.appointment.findMany({
      where: { patientId: id, clinicId: user.clinicId },
      orderBy: { startsAt: "desc" },
      take: 200,
      include: { service: { select: { name: true } }, professional: { include: { user: { select: { name: true } } } } },
    }),
    canFinance ? db.charge.findMany({ where: { patientId: id, clinicId: user.clinicId }, orderBy: { dueDate: "desc" }, take: 100 }) : [],
  ]);

  const [termDocs, termAcc] = await Promise.all([
    db.clinicDocument.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: { createdAt: "asc" } }),
    db.documentAcceptance.findMany({ where: { clinicId: user.clinicId, patientId: id } }),
  ]);
  const pendingTermsCount = termDocs.filter((d) => !termAcc.some((a) => a.documentId === d.id)).length;
  const cpf = p.cpfEnc ? maskCpf(decryptField(p.cpfEnc)) : null;
  const optinActive = p.consents.some((c) => c.type === "WHATSAPP_OPTIN" && !c.revokedAt);
  const age = p.birthDate ? ageYears(p.birthDate) : null;
  const initials = p.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  const finished = appointments.filter((a) => a.status === "COMPARECEU" || a.status === "FALTOU");
  const attended = appointments.filter((a) => a.status === "COMPARECEU").length;
  const missed = appointments.filter((a) => a.status === "FALTOU").length;
  const attendRate = finished.length ? Math.round((attended / finished.length) * 100) : null;
  const upcoming = appointments
    .filter((a) => a.startsAt > now && (a.status === "AGENDADA" || a.status === "CONFIRMADA"))
    .sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime());
  const today = localDate(now);
  const open = charges.filter((c) => effectiveStatus(c.status, c.dueDate.toISOString().slice(0, 10), today) !== "PAGA" && c.status !== "CANCELADA" && c.status !== "PAGA");
  const openTotal = open.reduce((t, c) => t + c.amountCents, 0);

  const tabs = [
    ["resumo", "Resumo"],
    ["atendimentos", `Atendimentos (${appointments.length})`],
    ...(canFinance ? [["financeiro", "Financeiro"]] : []),
    ["dados", "Dados e consentimentos"],
  ] as const;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/pacientes" className="text-xs text-zinc-500 underline">← Pacientes</Link>

      {/* cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-[family-name:var(--font-display)] text-xl font-semibold text-emerald-800">
            {initials || "?"}
          </span>
          <div>
            <h1 className="text-2xl leading-tight">{p.fullName}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600">
              {age !== null && <span>{age} anos</span>}
              {p.phoneE164 && <span>{formatPhoneBR(p.phoneE164)}</span>}
              {p.status === "INATIVO" && <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs">inativo</span>}
              <span className={`rounded px-2 py-0.5 text-xs ${optinActive ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"}`}>
                WhatsApp {optinActive ? "autorizado" : "não autorizado"}
              </span>
              {p.tags.map((t) => (
                <span key={t} className="rounded-full border px-2 py-0.5 text-xs">{t}</span>
              ))}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.status === "ATIVO" && (
            <Link href={`/agenda/novo?patient=${p.id}`} className="rounded bg-emerald-700 px-3 py-2 text-sm text-white">Agendar</Link>
          )}
          {user.role === "PROFISSIONAL" && <Link href={`/pacientes/${p.id}/prontuario`} className="rounded border px-3 py-2 text-sm">Prontuário</Link>}
          {pendingTermsCount > 0 && <Link href={`/pacientes/${p.id}?aba=dados`} className="rounded bg-amber-100 px-3 py-2 text-sm text-amber-900">{pendingTermsCount} termo(s) pendente(s)</Link>}
          {user.role !== "PROFISSIONAL" && p.phoneE164 && optinActive && <Link href={`/whatsapp/nova?patient=${p.id}`} className="rounded border px-3 py-2 text-sm">WhatsApp</Link>}
          <Link href={`/pacientes/${p.id}/editar`} className="rounded border px-3 py-2 text-sm">Editar</Link>
          <form action={setPatientStatusAction}>
            <input type="hidden" name="patientId" value={p.id} />
            <input type="hidden" name="status" value={p.status === "ATIVO" ? "INATIVO" : "ATIVO"} />
            <button className="rounded border px-3 py-2 text-sm">{p.status === "ATIVO" ? "Inativar" : "Reativar"}</button>
          </form>
        </div>
      </div>

      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      {/* abas */}
      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Seções da ficha">
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            href={`/pacientes/${p.id}?aba=${key}`}
            aria-current={aba === key ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${aba === key ? "border-emerald-700 text-emerald-800" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {aba === "resumo" && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Atendimentos", String(appointments.filter((a) => a.status !== "CANCELADA").length)],
              ["Comparecimento", attendRate === null ? "—" : `${attendRate}%`],
              ["Faltas", String(missed)],
              ...(canFinance ? [["Em aberto", formatBRL(openTotal)]] : []),
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border bg-white p-4 shadow-sm">
                <p className="text-xs text-zinc-500">{k}</p>
                <p className="text-xl font-semibold">{v}</p>
              </div>
            ))}
          </div>

          <section className="space-y-2 rounded border p-4">
            <h2>Próximos atendimentos</h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhum atendimento futuro agendado.</p>
            ) : (
              <ul className="divide-y text-sm">
                {upcoming.slice(0, 5).map((a) => (
                  <li key={a.id}>
                    <Link href={`/agenda/${a.id}`} className="flex items-center justify-between gap-2 py-2 hover:text-emerald-700">
                      <span>
                        <strong>{localDate(a.startsAt).split("-").reverse().join("/")} · {localTime(a.startsAt)}</strong> · {a.service.name} com {a.professional.user.name}
                      </span>
                      <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid gap-2 rounded border p-4 text-sm sm:grid-cols-2">
            <p><span className="text-zinc-500">Nascimento:</span> {p.birthDate ? `${fmtDate(p.birthDate)}` : "—"}</p>
            <p><span className="text-zinc-500">CPF:</span> {cpf ?? "—"}</p>
            <p><span className="text-zinc-500">E-mail:</span> {p.email ?? "—"}</p>
            <p><span className="text-zinc-500">Convênio:</span> {p.insurance ?? "Particular"}</p>
            <p><span className="text-zinc-500">Origem:</span> {p.source ?? "—"}</p>
            <p><span className="text-zinc-500">Cadastrado em:</span> {p.createdAt.toLocaleDateString("pt-BR")}</p>
            {p.adminNotes && <p className="sm:col-span-2"><span className="text-zinc-500">Observações:</span> {p.adminNotes}</p>}
          </section>
        </div>
      )}

      {aba === "atendimentos" && (
        <section className="space-y-2 rounded border p-4">
          {appointments.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhum atendimento registrado.</p>
          ) : (
            <ul className="divide-y text-sm">
              {appointments.map((a) => (
                <li key={a.id}>
                  <Link href={`/agenda/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:text-emerald-700">
                    <span>
                      <strong>{localDate(a.startsAt).split("-").reverse().join("/")} · {localTime(a.startsAt)}</strong> · {a.service.name} · {a.professional.user.name}
                      {a.status === "CANCELADA" && a.cancelReason && <span className="text-xs text-zinc-500"> ({a.cancelReason})</span>}
                    </span>
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {aba === "financeiro" && canFinance && (
        <section className="space-y-3 rounded border p-4">
          <div className="flex items-center justify-between">
            <h2>Cobranças</h2>
            <Link href="/financeiro/nova" className={btn}>Nova cobrança</Link>
          </div>
          {charges.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma cobrança.</p>
          ) : (
            <ul className="divide-y text-sm">
              {charges.map((c) => {
                const eff = effectiveStatus(c.status, c.dueDate.toISOString().slice(0, 10), today);
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      vence {c.dueDate.toISOString().slice(0, 10).split("-").reverse().join("/")}
                      {c.paidAt && ` · pago em ${c.paidAt.toLocaleDateString("pt-BR")}`}
                    </span>
                    <span className="flex items-center gap-2">
                      <strong>{formatBRL(c.amountCents)}</strong>
                      <span className={`rounded px-2 py-0.5 text-xs ${eff === "PAGA" ? "bg-emerald-100 text-emerald-800" : eff === "VENCIDA" ? "bg-red-100 text-red-700" : "bg-zinc-100 text-zinc-700"}`}>
                        {eff === "PAGA" ? "Paga" : eff === "VENCIDA" ? "Vencida" : eff === "CANCELADA" ? "Cancelada" : "Pendente"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {aba === "dados" && (
        <div className="space-y-5">
          <section className="grid gap-2 rounded border p-4 text-sm sm:grid-cols-2">
            <p><span className="text-zinc-500">Sexo:</span> {p.sex ? SEX[p.sex as keyof typeof SEX] : "—"}</p>
            <p><span className="text-zinc-500">Profissão:</span> {p.occupation ?? "—"}</p>
            <p className="sm:col-span-2"><span className="text-zinc-500">Endereço:</span> {p.address ?? "—"}</p>
            <p><span className="text-zinc-500">Contato de emergência:</span> {p.emergencyName ?? "—"}</p>
            <p><span className="text-zinc-500">Telefone de emergência:</span> {p.emergencyPhone ? formatPhoneBR(p.emergencyPhone) : "—"}</p>
          </section>

          <section className="space-y-2 rounded border p-4">
            <h2>Consentimentos</h2>
            <ul className="space-y-1 text-sm">
              {p.consents.map((c) => (
                <li key={c.id}>
                  {c.type === "TRATAMENTO_DADOS" ? "Tratamento de dados" : c.type === "WHATSAPP_OPTIN" ? "Contato por WhatsApp" : c.type}
                  {" — "}registrado em {c.acceptedAt.toLocaleDateString("pt-BR")} ({c.version}{c.channel ? `, ${c.channel.toLowerCase()}` : ""})
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
            <h2>Responsáveis legais</h2>
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
            <h2>Contatos autorizados</h2>
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

          {user.role !== "PROFISSIONAL" && p.email && (
            <section className="space-y-2 rounded border p-4">
              <h2>Portal do paciente</h2>
              <p className="text-xs text-zinc-500">O paciente acessa consultas, pagamentos (Pix) e recibos com o e-mail cadastrado. Gere um link manual se precisar.</p>
              <PortalLink patientId={p.id} />
            </section>
          )}

          <section className="space-y-3 rounded border p-4">
            <h2>Termos e contratos</h2>
            {termDocs.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhum termo publicado. {user.role === "ADMIN" ? <Link href="/configuracoes/termos" className="underline">Criar termos</Link> : "O administrador pode publicá-los em Configurações."}</p>
            ) : (
              <ul className="divide-y text-sm">
                {termDocs.map((d) => {
                  const a = termAcc.find((x) => x.documentId === d.id);
                  return (
                    <li key={d.id} className="space-y-2 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>{d.title} <span className="text-xs text-zinc-500">(v{d.version})</span></span>
                        <span className="flex items-center gap-2">
                          {a ? (
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Aceito em {a.acceptedAt.toLocaleDateString("pt-BR")} · {a.method === "PORTAL" ? "portal" : "presencial"} · {a.acceptedByName}</span>
                          ) : (
                            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Pendente</span>
                          )}
                          <Link href={`/pacientes/${p.id}/termos/${d.id}/imprimir`} target="_blank" className={btn}>Imprimir</Link>
                        </span>
                      </div>
                      {!a && (
                        <form action={acceptTermInPersonAction} className="flex flex-wrap items-center gap-2 text-xs">
                          <input type="hidden" name="patientId" value={p.id} />
                          <input type="hidden" name="docId" value={d.id} />
                          <input name="name" required placeholder="Nome de quem assinou" className={input} />
                          <select name="relation" className={input}><option value="próprio">O próprio paciente</option><option value="responsável legal">Responsável legal</option></select>
                          <button className={btn}>Registrar aceite presencial</button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-3 rounded border p-4">
            <h2>Dados do titular (LGPD)</h2>
            <div className="flex flex-wrap gap-2">
              <a href={`/pacientes/${p.id}/exportar`} className="rounded border px-3 py-2 text-sm">Exportar dados (JSON)</a>
              <Link href={`/pacientes/${p.id}/mesclar`} className="rounded border px-3 py-2 text-sm">Mesclar cadastro duplicado</Link>
            </div>
            {user.role === "ADMIN" && (
              <details className="text-sm">
                <summary className="cursor-pointer text-red-700">Anonimizar este paciente</summary>
                <form action={anonymizePatientAction} className="mt-2 space-y-2">
                  <input type="hidden" name="patientId" value={p.id} />
                  <p className="text-xs text-zinc-600">
                    Remove nome, CPF, telefone, e-mail, endereço e demais dados identificáveis. Atendimentos, cobranças e prontuário são preservados por obrigação legal. Não há como desfazer.
                  </p>
                  <input name="confirm" placeholder="Digite o nome completo para confirmar" required className="w-full rounded border px-3 py-2 text-sm" />
                  <button className="rounded border border-red-300 px-3 py-2 text-sm text-red-700">Anonimizar definitivamente</button>
                </form>
              </details>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
