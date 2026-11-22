import Link from "next/link";
import { db } from "@/lib/db";
import { RECORD_TYPE_LABEL, requireClinician } from "@/lib/clinical";
import { nowPlus } from "@/lib/agenda";

export const dynamic = "force-dynamic";

export default async function SharedWithMePage() {
  const { user, professionalId } = await requireClinician();
  const now = nowPlus(0);
  const grants = await db.clinicalAccessGrant.findMany({
    where: { granteeId: professionalId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], record: { clinicId: user.clinicId } },
    orderBy: { createdAt: "desc" },
    include: {
      record: {
        select: {
          id: true,
          type: true,
          patientId: true,
          createdAt: true,
          patient: { select: { fullName: true } },
          professional: { include: { user: { select: { name: true } } } },
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl">Compartilhados comigo</h1>
        <p className="text-sm text-zinc-600">Registros que colegas liberaram para você, com finalidade e prazo. Somente leitura.</p>
      </div>
      <ul className="divide-y rounded border text-sm">
        {grants.length === 0 && <li className="p-4 text-zinc-500">Nenhum registro compartilhado com você no momento.</li>}
        {grants.map((g) => (
          <li key={g.id}>
            <Link href={`/pacientes/${g.record.patientId}/prontuario/${g.record.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span>
                <strong>{g.record.patient.fullName}</strong> · {RECORD_TYPE_LABEL[g.record.type]}
                <span className="block text-xs text-zinc-500">de {g.record.professional.user.name} · {g.purpose}</span>
              </span>
              <span className="text-xs text-zinc-500">{g.expiresAt ? `até ${g.expiresAt.toLocaleDateString("pt-BR")}` : "sem prazo"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
