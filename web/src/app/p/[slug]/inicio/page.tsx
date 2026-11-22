import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { getPortalSession, patientsForEmail } from "@/lib/portal";
import { localDate, localTime, nowPlus, STATUS_LABEL } from "@/lib/agenda";
import { effectiveStatus, formatBRL } from "@/lib/money";
import { SCALES, type ScaleKey } from "@/lib/scales";
import { confirmAppointmentPortalAction, createPortalPixAction, logoutPortalAction } from "@/app/actions/portal";

export const dynamic = "force-dynamic";

const fmt = (d: string) => d.split("-").reverse().join("/");

export default async function PortalHome({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const s = await getPortalSession(slug);
  if (!s) redirect(`/p/${slug}`);

  const patients = await patientsForEmail(s.clinic.id, s.email);
  const ids = patients.map((p) => p.id);
  const name = new Map(patients.map((p) => [p.id, p.fullName.split(" ")[0]]));
  const now = nowPlus(0);
  const today = localDate(now);

  const [upcoming, charges] = await Promise.all([
    db.appointment.findMany({
      where: { clinicId: s.clinic.id, patientId: { in: ids }, startsAt: { gt: now }, status: { in: ["AGENDADA", "CONFIRMADA"] } },
      orderBy: { startsAt: "asc" },
      take: 10,
      include: { service: { select: { name: true, modality: true } }, professional: { include: { user: { select: { name: true } } } } },
    }),
    db.charge.findMany({
      where: { clinicId: s.clinic.id, patientId: { in: ids }, status: { in: ["PENDENTE", "PAGA"] } },
      orderBy: { dueDate: "desc" },
      take: 30,
      include: { invoices: { where: { status: "EMITIDA" }, take: 1 } },
    }),
  ]);
  const [pendingScales, docs, accepted, pendingTasks] = await Promise.all([
    db.scaleAssignment.findMany({ where: { clinicId: s.clinic.id, patientId: { in: ids }, status: "PENDENTE" }, orderBy: { sentAt: "asc" } }),
    db.clinicDocument.findMany({ where: { clinicId: s.clinic.id, active: true }, orderBy: { createdAt: "asc" } }),
    db.documentAcceptance.findMany({ where: { clinicId: s.clinic.id, patientId: { in: ids } }, select: { patientId: true, documentId: true } }),
    db.patientTask.findMany({ where: { clinicId: s.clinic.id, patientId: { in: ids }, status: "PENDENTE" }, orderBy: { createdAt: "asc" } }),
  ]);
  const acceptedKey = new Set(accepted.map((a) => `${a.patientId}|${a.documentId}`));
  const pendingTerms = docs.filter((d) => ids.some((pid) => !acceptedKey.has(`${pid}|${d.id}`)));
  const open = charges.filter((c) => c.status === "PENDENTE");
  const paid = charges.filter((c) => c.status === "PAGA").slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">Olá{patients.length === 1 ? `, ${name.get(patients[0].id)}` : ""}!</h1>
        <form action={logoutPortalAction}>
          <input type="hidden" name="slug" value={slug} />
          <button className="rounded border px-3 py-1.5 text-sm">Sair</button>
        </form>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      {patients.length === 0 && <p className="rounded-lg border bg-white p-4 text-sm text-zinc-600">Não encontramos cadastro ativo para este e-mail.</p>}

      {(pendingScales.length > 0 || pendingTerms.length > 0 || pendingTasks.length > 0) && (
        <section className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-amber-900">Pendências</h2>
          <ul className="space-y-2 text-sm">
            {pendingTerms.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>Ler e aceitar: <strong>{d.title}</strong></span>
                <Link href={`/p/${slug}/termo/${d.id}`} className="rounded bg-emerald-700 px-3 py-1.5 text-white">Abrir</Link>
              </li>
            ))}
            {pendingTasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>Tarefa: <strong>{decryptField(t.titleEnc)}</strong>{patients.length > 1 && <> ({name.get(t.patientId)})</>}{t.dueDate && <span className="text-xs text-zinc-600"> · para {t.dueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</span>}</span>
                <Link href={`/p/${slug}/tarefa/${t.id}`} className="rounded bg-emerald-700 px-3 py-1.5 text-white">Abrir</Link>
              </li>
            ))}
            {pendingScales.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>Questionário: <strong>{SCALES[a.scaleKey as ScaleKey]?.name ?? a.scaleKey}</strong>{patients.length > 1 && <> ({name.get(a.patientId)})</>}</span>
                <Link href={`/p/${slug}/questionario/${a.id}`} className="rounded bg-emerald-700 px-3 py-1.5 text-white">Responder</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2>Próximas consultas</h2>
        {upcoming.length === 0 ? (
          <p className="rounded-xl border bg-white p-4 text-sm text-zinc-500">Nenhuma consulta agendada.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((a) => (
              <li key={a.id} className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{fmt(localDate(a.startsAt))} às {localTime(a.startsAt)}</p>
                    <p className="text-sm text-zinc-600">
                      {a.service.name} · {a.professional.user.name}
                      {patients.length > 1 && <> · {name.get(a.patientId)}</>}
                    </p>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-xs ${a.status === "CONFIRMADA" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-700"}`}>{STATUS_LABEL[a.status]}</span>
                </div>
                {a.service.modality === "ONLINE" && a.meetingUrl && (
                  <a href={a.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-block rounded border px-3 py-1.5 text-sm">Entrar na videochamada</a>
                )}
                {a.status === "AGENDADA" && (
                  <form action={confirmAppointmentPortalAction}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="id" value={a.id} />
                    <button className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white">Confirmar presença</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-zinc-500">Para remarcar ou cancelar, fale com a clínica{s.clinic.phone ? ` (${s.clinic.phone})` : ""}.</p>
      </section>

      <section className="space-y-2">
        <h2>Pagamentos em aberto</h2>
        {open.length === 0 ? (
          <p className="rounded-xl border bg-white p-4 text-sm text-zinc-500">Nenhum pagamento pendente. 🎉</p>
        ) : (
          <ul className="space-y-2">
            {open.map((c) => {
              const overdue = effectiveStatus(c.status, c.dueDate.toISOString().slice(0, 10), today) === "VENCIDA";
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm">
                  <div>
                    <p className="font-semibold">{formatBRL(c.amountCents)}</p>
                    <p className="text-xs text-zinc-500">
                      vence {fmt(c.dueDate.toISOString().slice(0, 10))}
                      {overdue && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-red-700">vencido</span>}
                      {patients.length > 1 && <> · {name.get(c.patientId)}</>}
                    </p>
                  </div>
                  {c.pixPayload ? (
                    <Link href={`/p/${slug}/pix/${c.id}`} className="rounded bg-emerald-700 px-3 py-2 text-sm text-white">Pagar com Pix</Link>
                  ) : (
                    <form action={createPortalPixAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="id" value={c.id} />
                      <button className="rounded bg-emerald-700 px-3 py-2 text-sm text-white">Pagar com Pix</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {paid.length > 0 && (
        <section className="space-y-2">
          <h2>Pagamentos recentes</h2>
          <ul className="divide-y rounded-xl border bg-white text-sm shadow-sm">
            {paid.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span>
                  {formatBRL(c.amountCents)}
                  <span className="ml-2 text-xs text-zinc-500">pago em {c.paidAt?.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                </span>
                <span className="flex gap-3">
                  <Link href={`/p/${slug}/recibo/${c.id}`} target="_blank" className="text-emerald-700 underline">Recibo</Link>
                  {c.invoices[0]?.pdfUrl && <a href={c.invoices[0].pdfUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">Nota fiscal</a>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
