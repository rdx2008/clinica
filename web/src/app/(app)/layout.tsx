import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { MFA_REQUIRED, requireUser } from "@/lib/session";

const ROLE_LABEL = {
  ADMIN: "Administrador",
  RECEPCAO: "Recepção",
  PROFISSIONAL: "Profissional",
  FINANCEIRO: "Financeiro",
} as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // MFA obrigatório para administrador e profissional.
  if (MFA_REQUIRED.includes(user.role) && !user.mfaSecret) redirect("/conta/mfa");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="font-semibold">{user.clinic.name}</p>
          <p className="text-xs text-zinc-500">
            {user.name} · {ROLE_LABEL[user.role]}
          </p>
        </div>
        <form action={logoutAction}>
          <button className="rounded border px-3 py-1 text-sm">Sair</button>
        </form>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
