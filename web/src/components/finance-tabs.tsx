import Link from "next/link";

const TABS = [
  ["/financeiro", "Cobranças"],
  ["/financeiro/despesas", "Despesas"],
  ["/financeiro/pacotes", "Pacotes"],
  ["/financeiro/convenios", "Convênios"],
  ["/financeiro/repasses", "Repasses"],
] as const;

export function FinanceTabs({ active, mes, limited }: { active: string; mes?: string; limited?: boolean }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Seções do financeiro">
      {TABS.filter(([href]) => !limited || href === "/financeiro" || href === "/financeiro/pacotes").map(([href, label]) => (
        <Link
          key={href}
          href={mes && href !== "/financeiro/pacotes" ? `${href}?mes=${mes}` : href}
          aria-current={active === href ? "page" : undefined}
          className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${active === href ? "border-emerald-700 text-emerald-800" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
