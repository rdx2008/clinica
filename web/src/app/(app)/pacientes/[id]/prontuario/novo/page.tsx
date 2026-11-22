import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { localDate, localTime } from "@/lib/agenda";
import { canAccessPatient, MAX_RECORD_CHARS, RECORD_TYPE_LABEL, requireClinician } from "@/lib/clinical";
import { DEFAULT_TEMPLATES, fillTemplate } from "@/lib/record-templates";
import { RecordForm, type TemplateOption } from "./record-form";

export const dynamic = "force-dynamic";

export default async function NewRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; atendimento?: string; tipo?: string }>;
}) {
  const { user, professionalId } = await requireClinician();
  const { id } = await params;
  const sp = await searchParams;
  if (!(await canAccessPatient(user.clinicId, professionalId, id))) notFound();

  const [appointments, patient, clinic, professional, mine] = await Promise.all([
    db.appointment.findMany({
      where: { clinicId: user.clinicId, patientId: id, professionalId, status: { not: "CANCELADA" } },
      orderBy: { startsAt: "desc" },
      take: 30,
      select: { id: true, startsAt: true },
    }),
    db.patient.findFirst({ where: { id, clinicId: user.clinicId }, select: { fullName: true } }),
    db.clinic.findUnique({ where: { id: user.clinicId }, select: { name: true, address: true } }),
    db.professional.findUnique({ where: { id: professionalId }, select: { councilType: true, councilNumber: true } }),
    db.recordTemplate.findMany({ where: { clinicId: user.clinicId, OR: [{ professionalId }, { professionalId: null }] }, orderBy: { name: "asc" } }),
  ]);

  // Variáveis preenchidas desde já para este paciente e profissional.
  const today = localDate(new Date()).split("-").reverse().join("/");
  const city = clinic?.address?.split(",").pop()?.trim().split("/")[0] ?? "";
  const vars = {
    paciente: patient?.fullName ?? "",
    data: today,
    profissional: user.name,
    registro: professional?.councilType && professional.councilNumber ? `${professional.councilType} ${professional.councilNumber}` : "",
    clinica: clinic?.name ?? "",
    cidade: city,
  };
  const templates: TemplateOption[] = [
    ...mine.map((t) => ({ key: `m-${t.id}`, name: t.name, type: t.type, content: fillTemplate(t.content, vars), own: t.professionalId !== null })),
    ...DEFAULT_TEMPLATES.map((t, i) => ({ key: `d-${i}`, name: t.name, type: t.type, content: fillTemplate(t.content, vars) })),
  ];
  const defaultType = sp.tipo && sp.tipo in RECORD_TYPE_LABEL ? sp.tipo : "EVOLUCAO";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/pacientes/${id}/prontuario`} className="text-xs text-zinc-500 underline">← Prontuário</Link>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl">Novo registro</h1>
        <Link href="/prontuario/modelos" className="text-sm text-emerald-700 underline">Gerenciar modelos</Link>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      <RecordForm
        patientId={id}
        typeLabels={RECORD_TYPE_LABEL}
        appointments={appointments.map((a) => ({ id: a.id, label: `${localDate(a.startsAt).split("-").reverse().join("/")} ${localTime(a.startsAt)}` }))}
        templates={templates}
        defaultAppointment={sp.atendimento ?? ""}
        defaultType={defaultType}
        max={MAX_RECORD_CHARS}
      />
    </div>
  );
}
