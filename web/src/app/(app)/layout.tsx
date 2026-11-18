import Link from "next/link";
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
  if (user.mustChangePassword) redirect("/conta/senha");
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
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/dashboard">Início</Link>
          {user.role !== "FINANCEIRO" && <Link href="/agenda">Agenda</Link>}
          {user.role !== "FINANCEIRO" && <Link href="/pacientes">Pacientes</Link>}
          {(user.role === "ADMIN" || user.role === "RECEPCAO") && <Link href="/whatsapp">WhatsApp</Link>}
          {user.role !== "PROFISSIONAL" && <Link href="/financeiro">Financeiro</Link>}
          {user.role === "ADMIN" && <Link href="/servicos">Serviços</Link>}
          {user.role === "ADMIN" && <Link href="/usuarios">Usuários</Link>}
          <Link href="/conta/senha">Minha senha</Link>
          <form action={logoutAction}>
            <button className="rounded border px-3 py-1">Sair</button>
          </form>
        </nav>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
