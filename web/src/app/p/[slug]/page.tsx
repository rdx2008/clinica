import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/portal";
import { mailConfigured } from "@/lib/mail";
import { RequestLinkForm } from "./request-form";

export const dynamic = "force-dynamic";

export default async function PortalEntry({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  if (await getPortalSession(slug)) redirect(`/p/${slug}/inicio`);

  return (
    <div className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-2xl">Acessar o portal</h1>
        <p className="mt-1 text-sm text-zinc-600">Veja suas consultas, pagamentos e recibos. Informe o e-mail que você cadastrou na clínica e enviaremos um link de acesso.</p>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      {mailConfigured() ? (
        <RequestLinkForm slug={slug} />
      ) : (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">O envio de link por e-mail ainda não está disponível. Peça o link de acesso à recepção da clínica.</p>
      )}
    </div>
  );
}
