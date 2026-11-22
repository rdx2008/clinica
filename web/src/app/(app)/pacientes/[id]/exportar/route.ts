import { db } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { getCurrentUser } from "@/lib/session";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Exporta os dados cadastrais do titular (portabilidade/acesso, LGPD art. 18).
// O prontuário NÃO entra aqui: tem regra própria de acesso e é entregue pelo profissional responsável.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || !["ADMIN", "RECEPCAO"].includes(user.role)) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;

  const p = await db.patient.findFirst({
    where: { id, clinicId: user.clinicId },
    include: {
      guardians: true,
      contacts: true,
      consents: true,
      appointments: { include: { service: { select: { name: true } } }, orderBy: { startsAt: "asc" } },
      charges: { orderBy: { dueDate: "asc" } },
    },
  });
  if (!p) return new Response("Not found", { status: 404 });

  await audit({ clinicId: user.clinicId, userId: user.id, action: "PACIENTE_EXPORTADO", entity: "Patient", entityId: id });

  const payload = {
    exportadoEm: new Date().toISOString(),
    observacao: "Dados cadastrais, atendimentos e cobranças. O prontuário clínico é fornecido pelo profissional responsável.",
    paciente: {
      nome: p.fullName,
      nascimento: p.birthDate?.toISOString().slice(0, 10) ?? null,
      cpf: p.cpfEnc ? decryptField(p.cpfEnc) : null,
      telefone: p.phoneE164,
      email: p.email,
      sexo: p.sex,
      profissao: p.occupation,
      endereco: p.address,
      contatoEmergencia: { nome: p.emergencyName, telefone: p.emergencyPhone },
      convenio: p.insurance,
      origem: p.source,
      etiquetas: p.tags,
      cadastradoEm: p.createdAt.toISOString(),
    },
    responsaveis: p.guardians.map((g) => ({ nome: g.name, parentesco: g.relation, telefone: g.phone, responsavelLegal: g.isLegalGuardian })),
    contatosAutorizados: p.contacts.map((c) => ({ nome: c.name, telefone: c.phone, escopo: c.scope })),
    consentimentos: p.consents.map((c) => ({ tipo: c.type, versao: c.version, canal: c.channel, aceitoEm: c.acceptedAt.toISOString(), revogadoEm: c.revokedAt?.toISOString() ?? null })),
    atendimentos: p.appointments.map((a) => ({ inicio: a.startsAt.toISOString(), fim: a.endsAt.toISOString(), servico: a.service.name, status: a.status })),
    cobrancas: p.charges.map((c) => ({ valorCentavos: c.amountCents, vencimento: c.dueDate.toISOString().slice(0, 10), status: c.status, pagoEm: c.paidAt?.toISOString() ?? null, forma: c.method })),
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="paciente-${id.slice(-8)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
