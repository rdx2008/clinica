import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { MFA_REQUIRED, requireUser } from "@/lib/session";
import { BrandMark } from "@/components/brand";
import { NavLinks, type NavGroup, type NavItem } from "@/components/nav";

const ROLE_LABEL = {
  ADMIN: "Administrador",
  RECEPCAO: "Recepção",
  PROFISSIONAL: "Profissional",
  FINANCEIRO: "Financeiro",
} as const;

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/conta/senha");
  // MFA obrigatório para administrador e profissional.
  if (MFA_REQUIRED.includes(user.role) && !user.mfaSecret) redirect("/conta/mfa");

  const r = user.role;
  const main: NavItem[] = [{ href: "/dashboard", label: "Início", icon: "home" }];
  if (r !== "FINANCEIRO") {
    main.push({ href: "/agenda", label: "Agenda", icon: "calendar" }, { href: "/pacientes", label: "Pacientes", icon: "users" });
  }
  const ops: NavItem[] = [];
  if (r === "ADMIN" || r === "RECEPCAO") ops.push({ href: "/whatsapp", label: "WhatsApp", icon: "chat" });
  if (r !== "PROFISSIONAL") ops.push({ href: "/financeiro", label: "Financeiro", icon: "wallet" });
  const admin: NavItem[] =
    r === "ADMIN"
      ? [
          { href: "/servicos", label: "Serviços", icon: "list" },
          { href: "/usuarios", label: "Usuários", icon: "stethoscope" },
          { href: "/auditoria", label: "Auditoria", icon: "shield" },
        ]
      : [];
  const account: NavItem[] = [{ href: "/conta/senha", label: "Minha senha", icon: "key" }];
  const groups: NavGroup[] = (
    [
      { items: main },
      { title: "Operação", items: ops },
      { title: "Administração", items: admin },
      { title: "Minha conta", items: account },
    ] satisfies NavGroup[]
  ).filter((g) => g.items.length > 0);

  const userBlock = (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.07] p-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-200 text-sm font-semibold text-emerald-900">
        {initials(user.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{user.name}</p>
        <p className="truncate text-xs text-white/55">{ROLE_LABEL[user.role]}</p>
      </div>
      <form action={logoutAction}>
        <button
          title="Sair"
          aria-label="Sair"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden="true">
            <path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      </form>
    </div>
  );

  const brand = (
    <div className="flex items-center gap-2.5">
      <BrandMark size={34} />
      <div className="min-w-0">
        <p className="truncate font-[family-name:var(--font-display)] text-[15px] font-semibold leading-tight text-white">{user.clinic.name}</p>
        <p className="text-[11px] text-white/50">Sistema de Clínicas</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* barra lateral (telas grandes) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-emerald-900 px-3 py-4 lg:flex">
        <div className="px-2 pb-2">{brand}</div>
        <div className="mt-2 flex-1 overflow-y-auto pr-1">
          <NavLinks groups={groups} />
        </div>
        <div className="pt-3">{userBlock}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* barra superior (celular/tablet) */}
        <header className="sticky top-0 z-30 border-b border-white/10 bg-emerald-900 lg:hidden">
          <details className="group">
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 [&::before]:hidden">
              {brand}
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white" aria-label="Abrir menu">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </span>
            </summary>
            <div className="max-h-[75vh] overflow-y-auto border-t border-white/10 px-3 pb-4">
              <NavLinks groups={groups} />
              <div className="pt-4">{userBlock}</div>
            </div>
          </details>
        </header>

        <main className="page-in flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
