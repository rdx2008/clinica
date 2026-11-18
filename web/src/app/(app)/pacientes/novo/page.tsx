import { createPatientAction } from "@/app/actions/patients";
import { requireRole } from "@/lib/session";
import { PatientForm } from "../patient-form";

export const dynamic = "force-dynamic";

export default async function NewPatientPage() {
  await requireRole("ADMIN", "RECEPCAO", "PROFISSIONAL");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Novo paciente</h1>
      <PatientForm action={createPatientAction} mode="create" />
    </div>
  );
}
