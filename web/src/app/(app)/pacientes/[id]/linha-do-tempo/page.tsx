import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { decryptField } from "@/lib/crypto";
import { canAccessPatient, RECORD_TYPE_LABEL, requireClinician } from "@/lib/clinical";
import { localDate, localTime, STATUS_LABEL } from "@/lib/agenda";
import { readScaleData } from "@/lib/scale-data";
import { SCALES, type ScaleKey } from "@/lib/scales";

export const dynamic = "force-dynamic";

type Kind = "registro" | "consulta" | "escala" | "plano" | "termo";
type Item = { at: Date; kind: Kind; title: string; detail?: string; href?: string; tone?: "red" };

const KINDS: Record<Kind, { label: string; dot: string }> = {
  registro: { label: "Registros", dot: "bg-emerald-600" },
  consulta: { label: "Consultas", dot: "bg-zinc-500" },
  escala: { label: "Escalas", dot: "bg-blue-600" },
  plano: { label: "Plano", dot: "bg-amber-500" },
  termo: { label: "Termos", dot: "bg-violet-600" },
};

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function snippet(text: string, q: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!q) return flat.length > 240 ? `${flat.slice(0, 240)}…` : flat;
  const i = norm(flat).indexOf(norm(q));
  const start = Math.max(0, i - 80);
  return `${start > 0 ? "…" : ""}${flat.slice(start, start + 240)}${start + 240 < flat.length ? "…" : ""}`;
}

// Linha do tempo clínica: tudo que aconteceu com o paciente sob a ótica do profissional logado,
// com busca no texto dos registros (a descriptografia acontece aqui, só para o autor).
export default async function TimelinePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; tipo?: string }> }) {
  const { user, professionalId } = await requireClinician();
  const { id } = await params;
  const sp = await searchParams;
  if (!(await canAccessPatient(user.clinicId, professionalId, id))) notFound();
  const q = (sp.q ?? "").trim().slice(0, 100);
  const only = sp.tipo && sp.tipo in KINDS ? (sp.tipo as Kind) : null;

  const [patient, records, appts, scales, plans, accepts] = await Promise.all([
    db.patient.findFirst({ where: { id, clinicId: user.clinicId }, select: { fullName: true } }),
    db.clinicalRecord.findMany({ where: { clinicId: user.clinicId, patientId: id, professionalId }, orderBy: { createdAt: "desc" }, take: 500, select: { id: true, type: true, status: true, contentEnc: true, createdAt: true } }),
    db.appointment.findMany({ where: { clinicId: user.clinicId, patientId: id, professionalId }, orderBy: { startsAt: "desc" }, take: 300, include: { service: { select: { name: true } } } }),
    db.scaleAssignment.findMany({ where: { clinicId: user.clinicId, patientId: id, professionalId, status: "RESPONDIDA" }, orderBy: { answeredAt: "desc" }, take: 100 }),
    db.therapyPlan.findMany({ where: { clinicId: user.clinicId, patientId: id, professionalId }, include: { goals: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.documentAcceptance.findMany({ where: { clinicId: user.clinicId, patientId: id }, include: { document: { select: { title: true, version: true } } }, orderBy: { acceptedAt: "desc" }, take: 50 }),
  ]);
  if (!patient) notFound();

  const items: Item[] = [];
  for (const r of records) {
    let text = "";
    try { text = decryptField(r.contentEnc); } catch { text = ""; }
    items.push({ at: r.createdAt, kind: "registro", title: `${RECORD_TYPE_LABEL[r.type]}${r.status === "APROVADO" ? "" : " (rascunho)"}`, detail: text, href: `/pacientes/${id}/prontuario/${r.id}` });
  }
  for (const a of appts) {
    items.push({ at: a.startsAt, kind: "consulta", title: `${a.service.name} — ${STATUS_LABEL[a.status] ?? a.status}`, detail: a.cancelReason ? `Motivo: ${a.cancelReason}` : undefined });
  }
  for (const s of scales) {
    const d = readScaleData(s.dataEnc);
    const name = SCALES[s.scaleKey as ScaleKey]?.name ?? s.scaleKey;
    items.push({ at: s.answeredAt ?? s.sentAt, kind: "escala", title: `${name}${d ? `: ${d.score} pontos` : ""}`, detail: d?.severity, href: `/pacientes/${id}/escalas`, tone: s.riskFlag ? "red" : undefined });
  }
  for (const p of plans) {
    let focus = "";
    try { focus = decryptField(p.focusEnc); } catch { focus = ""; }
    items.push({ at: p.createdAt, kind: "plano", title: "Plano terapêutico iniciado", detail: focus, href: `/pacientes/${id}/plano` });
    for (const g of p.goals) {
      let text = "";
      try { text = decryptField(g.textEnc); } catch { text = ""; }
      if (g.status === "ALCANCADA") items.push({ at: g.updatedAt, kind: "plano", title: "Meta alcançada", detail: text, href: `/pacientes/${id}/plano` });
      else items.push({ at: g.createdAt, kind: "plano", title: "Meta definida", detail: text, href: `/pacientes/${id}/plano` });
    }
  }
  for (const a of accepts) {
    items.push({ at: a.acceptedAt, kind: "termo", title: `Aceite: ${a.document.title} (v${a.document.version})`, detail: `${a.method === "PORTAL" ? "Portal" : "Presencial"} · ${a.acceptedByName}` });
  }

  const nq = norm(q);
  const shown = items
    .filter((i) => (only ? i.kind === only : true))
    .filter((i) => (nq ? norm(`${i.title} ${i.detail ?? ""}`).includes(nq) : true))
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  await audit({ clinicId: user.clinicId, userId: user.id, action: q ? "PRONTUARIO_BUSCA" : "LINHA_DO_TEMPO_VISUALIZADA", entity: "Patient", entityId: id });

  const counts = new Map<Kind, number>();
  for (const i of items) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...extra });
    return `/pacientes/${id}/linha-do-tempo?${p.toString()}`;
  };

  const months = shown.map((i) => i.at.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }));
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/pacientes/${id}/prontuario`} className="text-xs text-zinc-500 underline">← Prontuário de {patient.fullName}</Link>
      <h1 className="text-2xl">Linha do tempo</h1>
      <p className="text-xs text-zinc-500">Visível apenas para você. Reúne registros, consultas, escalas, plano e termos deste paciente. A busca procura dentro do texto dos registros.</p>

      <form method="get" className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar no prontuário (ex.: insônia, luto, medicação)" className="min-w-0 flex-1 rounded border bg-white px-3 py-2 text-sm" />
        {only && <input type="hidden" name="tipo" value={only} />}
        <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Buscar</button>
      </form>

      <div className="flex flex-wrap gap-1.5 text-xs">
        <Link href={qs({})} className={`rounded-full border px-2.5 py-1 ${!only ? "bg-zinc-800 text-white" : "bg-white"}`}>Tudo ({items.length})</Link>
        {(Object.keys(KINDS) as Kind[]).map((k) => (
          <Link key={k} href={qs({ tipo: k })} className={`rounded-full border px-2.5 py-1 ${only === k ? "bg-zinc-800 text-white" : "bg-white"}`}>{KINDS[k].label} ({counts.get(k) ?? 0})</Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border bg-white p-4 text-sm text-zinc-500">{q ? "Nada encontrado para essa busca." : "Nada registrado ainda."}</p>
      ) : (
        <ol className="space-y-1">
          {shown.map((i, idx) => {
            const month = months[idx];
            const head = idx === 0 || month !== months[idx - 1];
            const body = (
              <div className={`rounded-xl border bg-white p-3 text-sm shadow-sm ${i.tone === "red" ? "border-red-300" : ""}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{i.title}</span>
                  <span className="text-xs text-zinc-500">{localDate(i.at).split("-").reverse().join("/")} {localTime(i.at)}</span>
                </div>
                {i.detail && <p className="mt-1 text-zinc-600">{i.kind === "registro" ? snippet(i.detail, q) : i.detail}</p>}
              </div>
            );
            return (
              <li key={`${i.kind}-${idx}`}>
                {head && <h2 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500 first:mt-0">{month}</h2>}
                <div className="flex gap-3">
                  <span className={`mt-4 h-2.5 w-2.5 shrink-0 rounded-full ${KINDS[i.kind].dot}`} aria-hidden />
                  <div className="min-w-0 flex-1">{i.href ? <Link href={i.href} className="block hover:opacity-90">{body}</Link> : body}</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
