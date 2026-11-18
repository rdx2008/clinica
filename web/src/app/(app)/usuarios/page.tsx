import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import {
  createUserAction,
  resetMfaAction,
  resetPasswordAction,
  setActiveAction,
  setRoleAction,
} from "@/app/actions/users";

export const dynamic = "force-dynamic";

const ROLES = [
  ["ADMIN", "Administrador"],
  ["RECEPCAO", "Recepção"],
  ["PROFISSIONAL", "Profissional"],
  ["FINANCEIRO", "Financeiro"],
] as const;

const input = "rounded border px-2 py-1 text-sm";
const btn = "rounded border px-2 py-1 text-xs";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const admin = await requireRole("ADMIN");
  const { erro, ok } = await searchParams;
  const users = await db.user.findMany({
    where: { clinicId: admin.clinicId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, active: true, mfaSecret: true, mustChangePassword: true },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold">Usuários</h1>
      {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
      {ok && <p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">{ok}</p>}

      <section className="space-y-3 rounded border p-4">
        <h2 className="font-medium">Novo usuário</h2>
        <form action={createUserAction} className="grid gap-3 sm:grid-cols-2">
          <input name="name" placeholder="Nome completo" required className={input} />
          <input name="email" type="email" placeholder="E-mail" required className={input} />
          <select name="role" defaultValue="RECEPCAO" className={input}>
            {ROLES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <input name="password" type="password" placeholder="Senha provisória (mín. 12)" minLength={12} required autoComplete="new-password" className={input} />
          <input name="councilType" placeholder="Conselho (ex.: CRP) — profissionais" className={input} />
          <input name="councilNumber" placeholder="Nº do registro — profissionais" className={input} />
          <button className="rounded bg-emerald-700 px-3 py-2 text-sm text-white sm:col-span-2">Criar usuário</button>
        </form>
      </section>

      <section className="space-y-3">
        {users.map((u) => {
          const self = u.id === admin.id;
          return (
            <article key={u.id} className={`space-y-2 rounded border p-3 ${u.active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-medium">{u.name}{self && " (você)"}</p>
                  <p className="text-xs text-zinc-500">
                    {u.email} · {u.active ? "ativo" : "desativado"} · 2 etapas {u.mfaSecret ? "ativa" : "pendente"}
                    {u.mustChangePassword && " · senha provisória"}
                  </p>
                </div>
              </div>
              {!self && (
                <div className="flex flex-wrap items-center gap-2">
                  <form action={setRoleAction} className="flex gap-1">
                    <input type="hidden" name="userId" value={u.id} />
                    <select name="role" defaultValue={u.role} className={input}>
                      {ROLES.map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <button className={btn}>Alterar perfil</button>
                  </form>
                  <form action={setActiveAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="active" value={String(!u.active)} />
                    <button className={btn}>{u.active ? "Desativar" : "Reativar"}</button>
                  </form>
                  <form action={resetMfaAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button className={btn}>Remover 2 etapas</button>
                  </form>
                  <form action={resetPasswordAction} className="flex gap-1">
                    <input type="hidden" name="userId" value={u.id} />
                    <input name="password" type="password" placeholder="Nova senha provisória" minLength={12} required autoComplete="new-password" className={input} />
                    <button className={btn}>Redefinir senha</button>
                  </form>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
