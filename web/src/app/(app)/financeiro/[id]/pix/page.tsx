import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { formatBRL } from "@/lib/money";
import { CopyButton } from "@/components/copy-button";

export const dynamic = "force-dynamic";

export default async function PixPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("ADMIN", "FINANCEIRO", "RECEPCAO");
  const { id } = await params;
  const c = await db.charge.findFirst({ where: { id, clinicId: user.clinicId }, include: { patient: { select: { fullName: true } } } });
  if (!c) notFound();

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link href={`/financeiro?mes=${c.competence ?? ""}`} className="text-xs text-zinc-500 underline">← Financeiro</Link>
      <div className="space-y-4 rounded-2xl border bg-white p-6 text-center shadow-sm">
        <div>
          <p className="text-sm text-zinc-500">Cobrança de {c.patient.fullName}</p>
          <p className="text-3xl font-semibold">{formatBRL(c.amountCents)}</p>
        </div>

        {c.status === "PAGA" ? (
          <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800">Pagamento recebido{c.paidAt ? ` em ${c.paidAt.toLocaleDateString("pt-BR")}` : ""}. ✓</p>
        ) : c.pixPayload ? (
          <>
            {c.pixQrImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`data:image/png;base64,${c.pixQrImage}`} alt="QR Code Pix" className="mx-auto h-56 w-56 rounded-lg border" />
            )}
            <div className="space-y-2 text-left">
              <p className="text-xs font-medium text-zinc-600">Pix copia e cola</p>
              <p className="break-all rounded-lg bg-zinc-100 p-3 font-mono text-xs">{c.pixPayload}</p>
              <CopyButton text={c.pixPayload} label="Copiar código Pix" />
            </div>
            <p className="text-xs text-zinc-500">
              A cobrança é baixada sozinha quando o pagamento é confirmado (a tela atualiza ao recarregar).
              {c.pixExpiresAt && ` Válido até ${c.pixExpiresAt.toLocaleDateString("pt-BR")}.`}
            </p>
            {c.gatewayUrl && <a href={c.gatewayUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-700 underline">Abrir fatura online</a>}
          </>
        ) : (
          <p className="text-sm text-zinc-600">Esta cobrança ainda não tem Pix gerado.</p>
        )}
      </div>
    </div>
  );
}
