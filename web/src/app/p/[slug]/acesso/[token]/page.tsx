import { consumePortalLinkAction } from "@/app/actions/portal";

export const dynamic = "force-dynamic";

// O link só vale ao clicar em "Entrar" (um POST): programas de e-mail que pré-visualizam links não o consomem.
export default async function PortalAccess({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  return (
    <div className="space-y-4 rounded-2xl border bg-white p-6 text-center shadow-sm">
      <h1 className="text-2xl">Entrar no portal</h1>
      <p className="text-sm text-zinc-600">Confirme para acessar suas consultas e pagamentos.</p>
      <form action={consumePortalLinkAction}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="token" value={token} />
        <button className="w-full rounded bg-emerald-700 px-4 py-3 text-white">Entrar</button>
      </form>
    </div>
  );
}
