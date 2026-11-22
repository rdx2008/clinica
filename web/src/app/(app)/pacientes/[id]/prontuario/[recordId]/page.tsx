import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { MAX_RECORD_CHARS, RECORD_TYPE_LABEL, requireClinician } from "@/lib/clinical";
import { nowPlus } from "@/lib/agenda";
import {
  approveRecordAction,
  deleteDraftAction,
  grantAccessAction,
  revokeGrantAction,
  updateRecordAction,
} from "@/app/actions/records";

export const dynamic = "force-dynamic";

const btn = "rounded border px-3 py-1 text-sm";
const input = "rounded border px-2 py-1.5 text-sm";

export default async function RecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; recordId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { user, professionalId } = await requireClinician();
  const { id, recordId } = await params;
  const { erro } = await searchParams;

  const rec = await db.clinicalRecord.findFirst({
    where: { id: recordId, patientId: id, clinicId: user.clinicId },
    include: {
      patient: { select: { fullName: true } },
      professional: { include: { user: { select: { name: true } } } },
      grants: true,
      _count: { select: { versions: true } },
    },
  });
  if (!rec) notFound();

  const isAuthor = rec.professionalId === professionalId;
  // Outro profissional só lê com compartilhamento vigente (nunca anotações pessoais).
  const myGrant = isAuthor ? null : rec.grants.find((g) => g.granteeId === professionalId && (!g.expiresAt || g.expiresAt > nowPlus(0)));
  if (!isAuthor && (!myGrant || rec.type === "ANOTACAO_PESSOAL")) notFound();

  await audit({
    clinicId: user.clinicId,
    userId: user.id,
    action: isAuthor ? "PRONTUARIO_VISUALIZADO" : "PRONTUARIO_VISUALIZADO_COMPARTILHADO",
    entity: "ClinicalRecord",
    entityId: rec.id,
  });

  const content = decryptField(rec.contentEnc);
  const approved = rec.status === "APROVADO";
  const others = isAuthor
    ? await db.professional.findMany({
        where: { clinicId: user.clinicId, id: { not: professionalId }, user: { active: true } },
        include: { user: { select: { name: true } } },
        orderBy: { user: { name: "asc" } },
      })
    : [];
  const nameOf = new Map(others.map((p) => [p.id, p.user.name]));
  const grantList = isAuthor ? await db.clinicalAccessGrant.findMany({ where: { recordId: rec.id }, orderBy: { createdAt: "desc" } }) : [];
  const allNames = new Map(
    (await db.professional.findMany({ where: { id: { in: grantList.map((g) => g.granteeId) } }, include: { user: { select: { name: true } } } })).map((p) => [p.id, p.user.name]),
  );
  void nameOf;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/pacientes/${id}/prontuario`} className="text-xs text-zinc-500 underline">← Prontuário de {rec.patient.fullName}</Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="text-2xl">
          {RECORD_TYPE_LABEL[rec.type]}{" "}
          <span className="text-sm font-normal text-zinc-500">
            · {approved ? `aprovado em ${rec.approvedAt?.toLocaleDateString("pt-BR")}` : "rascunho"} · v{rec.version}
            {rec._count.versions > 0 && ` (${rec._count.versions} versões anteriores guardadas)`}
          </span>
        </h1>
        {isAuthor && (
          <Link href={`/pacientes/${id}/prontuario/${rec.id}/imprimir`} className={btn} target="_blank">Imprimir / PDF</Link>
        )}
      </div>

      {!isAuthor && myGrant && (
        <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
          Compartilhado por <strong>{rec.professional.user.name}</strong> — finalidade: {myGrant.purpose}.
          {myGrant.expiresAt && <> Acesso até {myGrant.expiresAt.toLocaleDateString("pt-BR")}.</>} Somente leitura.
        </p>
      )}
      {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

      {approved || !isAuthor ? (
        <pre className="whitespace-pre-wrap rounded border bg-white p-5 font-sans text-sm leading-relaxed">{content}</pre>
      ) : (
        <>
          <form action={updateRecordAction} className="space-y-2">
            <input type="hidden" name="id" value={rec.id} />
            <textarea name="content" required rows={16} maxLength={MAX_RECORD_CHARS} defaultValue={content} className="w-full rounded border px-3 py-2 text-sm" />
            <button className={btn}>Salvar alterações</button>
          </form>
          <div className="flex gap-2">
            <form action={approveRecordAction}>
              <input type="hidden" name="id" value={rec.id} />
              <button className="rounded bg-emerald-700 px-3 py-1 text-sm text-white">Aprovar (trava o registro)</button>
            </form>
            <form action={deleteDraftAction}>
              <input type="hidden" name="id" value={rec.id} />
              <button className={btn}>Descartar rascunho</button>
            </form>
          </div>
        </>
      )}

      {isAuthor && rec.type !== "ANOTACAO_PESSOAL" && (
        <section className="space-y-3 rounded border p-4">
          <h2>Compartilhar com outro profissional</h2>
          <p className="text-xs text-zinc-500">Acesso somente leitura, com finalidade e prazo. Cada acesso fica registrado na auditoria.</p>
          {grantList.length > 0 && (
            <ul className="divide-y text-sm">
              {grantList.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <strong>{allNames.get(g.granteeId) ?? "Profissional"}</strong> · {g.purpose}
                    {g.expiresAt && <span className="text-xs text-zinc-500"> · até {g.expiresAt.toLocaleDateString("pt-BR")}{g.expiresAt < nowPlus(0) ? " (expirado)" : ""}</span>}
                  </span>
                  <form action={revokeGrantAction}>
                    <input type="hidden" name="grantId" value={g.id} />
                    <button className="rounded border px-2 py-1 text-xs">Revogar</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          {others.length === 0 ? (
            <p className="text-sm text-zinc-500">Não há outros profissionais ativos na clínica.</p>
          ) : (
            <form action={grantAccessAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="recordId" value={rec.id} />
              <label className="text-xs">Profissional
                <select name="granteeId" required defaultValue="" className={`${input} block`}>
                  <option value="" disabled>Selecione…</option>
                  {others.map((p) => <option key={p.id} value={p.id}>{p.user.name}</option>)}
                </select>
              </label>
              <label className="text-xs">Finalidade
                <input name="purpose" required minLength={5} maxLength={200} placeholder="Ex.: discussão de caso" className={`${input} block w-56`} />
              </label>
              <label className="text-xs">Prazo
                <select name="days" defaultValue="30" className={`${input} block`}>
                  <option value="7">7 dias</option>
                  <option value="30">30 dias</option>
                  <option value="90">90 dias</option>
                  <option value="180">180 dias</option>
                </select>
              </label>
              <button className={btn}>Compartilhar</button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
