import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; pagina?: string }> }) {
  const user = await requireRole("ADMIN");
  const sp = await searchParams;
  const term = (sp.q ?? "").trim().toUpperCase();
  const page = Math.max(1, Number(sp.pagina) || 1);

  const where = { clinicId: user.clinicId, ...(term ? { action: { contains: term } } : {}) };
  const [logs, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.auditLog.count({ where }),
  ]);
  const ids = [...new Set(logs.map((l) => l.userId).filter((x): x is string => !!x))];
  const users = await db.user.findMany({ where: { id: { in: ids }, clinicId: user.clinicId }, select: { id: true, name: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const link = (p: number) => `/auditoria?${term ? `q=${encodeURIComponent(term)}&` : ""}pagina=${p}`;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">Auditoria</h1>
      <p className="text-xs text-zinc-500">Registro de acessos e alterações (LGPD). Os registros não podem ser editados pela aplicação.</p>
      <form className="flex gap-2">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Filtrar por ação (ex.: PRONTUARIO, LOGIN, PACIENTE)" className="flex-1 rounded border px-3 py-2 text-sm" />
        <button className="rounded border px-3 py-2 text-sm">Filtrar</button>
      </form>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50 text-zinc-500">
            <tr><th className="p-2">Quando</th><th className="p-2">Quem</th><th className="p-2">Ação</th><th className="p-2">Registro</th><th className="p-2">IP</th></tr>
          </thead>
          <tbody className="divide-y">
            {logs.length === 0 && <tr><td colSpan={5} className="p-3 text-zinc-500">Nenhum registro.</td></tr>}
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap p-2">{l.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                <td className="p-2">{l.userId ? (nameOf.get(l.userId) ?? "usuário removido") : "sistema/externo"}</td>
                <td className="p-2 font-mono">{l.action}</td>
                <td className="p-2">{l.entity}{l.entityId ? ` · ${l.entityId.slice(0, 8)}` : ""}</td>
                <td className="p-2">{l.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        {page > 1 ? <Link href={link(page - 1)} className="rounded border px-3 py-1">← Mais recentes</Link> : <span />}
        <span className="text-xs text-zinc-500">Página {page} de {pages} · {total} registros</span>
        {page < pages ? <Link href={link(page + 1)} className="rounded border px-3 py-1">Mais antigos →</Link> : <span />}
      </div>
    </div>
  );
}
