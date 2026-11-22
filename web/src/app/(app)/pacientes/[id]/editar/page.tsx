import { notFound } from "next/navigation";
import { updatePatientAction } from "@/app/actions/patients";
import { db } from "@/lib/db";
import { formatPhoneBR } from "@/lib/br";
import { requireRole } from "@/lib/session";
import { PatientForm } from "../../patient-form";
import { patientScope } from "@/lib/clinical";

export const dynamic = "force-dynamic";

export default async function EditPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("ADMIN", "RECEPCAO", "PROFISSIONAL");
  const { id } = await params;
  const p = await db.patient.findFirst({ where: { id, clinicId: user.clinicId, AND: [patientScope(user)] } });
  if (!p) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Editar paciente</h1>
      <PatientForm
        action={updatePatientAction}
        mode="edit"
        initial={{
          id: p.id,
          fullName: p.fullName,
          birthDate: p.birthDate ? p.birthDate.toISOString().slice(0, 10) : "",
          phone: p.phoneE164 ? formatPhoneBR(p.phoneE164) : "",
          email: p.email ?? "",
          source: p.source ?? "",
          tags: p.tags.join(", "),
          hasCpf: !!p.cpfEnc,
          sex: p.sex ?? "",
          occupation: p.occupation ?? "",
          address: p.address ?? "",
          emergencyName: p.emergencyName ?? "",
          emergencyPhone: p.emergencyPhone ? formatPhoneBR(p.emergencyPhone) : "",
          insurance: p.insurance ?? "",
          adminNotes: p.adminNotes ?? "",
        }}
      />
    </div>
  );
}
