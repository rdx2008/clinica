import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getPortalSession, patientsForEmail } from "@/lib/portal";
import { formatBRL } from "@/lib/money";
import { CopyButton } from "@/components/copy-button";

export const dynamic = "force-dynamic";

export default async function PortalPix({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const s = await getPortalSession(slug);
  if (!s) redirect(`/p/${slug}`);
  const patients = await patientsForEmail(s.clinic.id, s.email);
  const c = await db.charge.findFirst({ where: { id, clinicId: s.clinic.id, patientId: { in: patients.map((p) => p.id) } } });
  if (!c) notFound();

  return (
    <div className="space-y-4">
      <Link href={`/p/${slug}/inicio`} className="text-xs text-zinc-500 underline">← Voltar</Link>
      <div className="space-y-4 rounded-2xl border bg-white p-6 text-center shadow-sm">
        <p className="text-3xl font-semibold">{formatBRL(c.amountCents)}</p>
        {c.status === "PAGA" ? (
          <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800">Pagamento confirmado. Obrigado! ✓</p>
        ) : c.pixPayload ? (
          <>
            {c.pixQrImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`data:image/png;base64,${c.pixQrImage}`} alt="QR Code Pix" className="mx-auto h-56 w-56 rounded-lg border" />
            )}
            <p className="text-sm text-zinc-600">Abra o app do seu banco, escolha pagar com Pix e leia o QR Code, ou use o código abaixo.</p>
            <p className="break-all rounded-lg bg-zinc-100 p-3 text-left font-mono text-xs">{c.pixPayload}</p>
            <CopyButton text={c.pixPayload} label="Copiar código Pix" />
            <p className="text-xs text-zinc-500">Depois de pagar, a confirmação aparece aqui em instantes. Recarregue a página.</p>
          </>
        ) : (
          <p className="text-sm text-zinc-600">O Pix desta cobrança ainda não foi gerado.</p>
        )}
      </div>
    </div>
  );
}
