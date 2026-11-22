"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { createDemoData, removeDemoData } from "@/lib/demo";

function back(msg?: string, ok?: string): never {
  const q = msg ? `?erro=${encodeURIComponent(msg)}` : ok ? `?ok=${encodeURIComponent(ok)}` : "";
  redirect(`/configuracoes${q}`);
}

export async function createDemoAction() {
  const admin = await requireRole("ADMIN");
  try {
    const r = await createDemoData(admin.clinicId);
    await audit({ clinicId: admin.clinicId, userId: admin.id, action: "DEMO_CRIADO", entity: "Clinic", entityId: admin.clinicId });
    back(undefined, `Dados de demonstração criados: ${r.patients} pacientes, ${r.appointments} atendimentos e ${r.charges} cobranças.`);
  } catch (e) {
    if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
    if (e && typeof e === "object" && "digest" in e) throw e;
    back(e instanceof Error ? e.message : "Não foi possível criar os dados de demonstração.");
  }
}

export async function removeDemoAction() {
  const admin = await requireRole("ADMIN");
  try {
    await removeDemoData(admin.clinicId);
    await audit({ clinicId: admin.clinicId, userId: admin.id, action: "DEMO_REMOVIDO", entity: "Clinic", entityId: admin.clinicId });
    back(undefined, "Dados de demonstração removidos.");
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    back("Não foi possível remover tudo: algum dado de demonstração foi usado em registros reais. Nada foi apagado.");
  }
}
