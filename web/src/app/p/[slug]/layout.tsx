import { notFound } from "next/navigation";
import { getPortalClinic } from "@/lib/portal";
import { BrandMark } from "@/components/brand";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const clinic = await getPortalClinic(slug);
  if (!clinic) notFound();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <BrandMark size={38} />
        <div>
          <p className="font-[family-name:var(--font-display)] text-lg font-semibold leading-tight">{clinic.name}</p>
          <p className="text-xs text-zinc-500">Portal do paciente</p>
        </div>
      </header>
      <main className="page-in flex-1">{children}</main>
      <footer className="mt-8 text-center text-xs text-zinc-500">
        {[clinic.phone, clinic.email].filter(Boolean).join(" · ")}
        <p className="mt-1">Conexão segura · seus dados são protegidos</p>
      </footer>
    </div>
  );
}
