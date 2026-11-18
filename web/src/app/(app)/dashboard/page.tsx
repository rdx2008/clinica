import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">Olá, {user.name.split(" ")[0]}</h1>
      <p className="text-sm text-zinc-600">
        Autenticação e perfis ativos. Agenda, pacientes e WhatsApp entram nas próximas etapas.
      </p>
    </div>
  );
}
