import { cookies } from "next/headers";
import { db } from "./db";
import { PORTAL_SESSION_MS, signPortalSession, verifyPortalSession } from "./portal-core";

export const PORTAL_COOKIE = "portal_session";

export async function getPortalClinic(slug: string) {
  return db.clinic.findUnique({ where: { portalSlug: slug }, select: { id: true, name: true, portalSlug: true, phone: true, email: true, address: true } });
}

export async function startPortalSession(clinicId: string, email: string) {
  const store = await cookies();
  store.set(PORTAL_COOKIE, signPortalSession({ clinicId, email, exp: Date.now() + PORTAL_SESSION_MS }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/p",
    maxAge: PORTAL_SESSION_MS / 1000,
  });
}

export async function endPortalSession() {
  (await cookies()).delete({ name: PORTAL_COOKIE, path: "/p" });
}

// Sessão do portal para a clínica do endereço (/p/<slug>). Nunca vale entre clínicas.
export async function getPortalSession(slug: string) {
  const clinic = await getPortalClinic(slug);
  if (!clinic) return null;
  const token = (await cookies()).get(PORTAL_COOKIE)?.value;
  const s = token ? verifyPortalSession(token) : null;
  if (!s || s.clinicId !== clinic.id) return null;
  return { clinic, email: s.email };
}

// Pacientes ativos que usam este e-mail (um responsável pode acompanhar mais de um paciente).
export async function patientsForEmail(clinicId: string, email: string) {
  return db.patient.findMany({
    where: { clinicId, status: "ATIVO", email: { equals: email, mode: "insensitive" } },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });
}
