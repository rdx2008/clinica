// Marca do sistema: uma cruz suave dentro de um selo arredondado.
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="#0f6b5d" />
      <rect x="1" y="1" width="38" height="38" rx="10" stroke="#fff" strokeOpacity="0.18" />
      <path d="M17 10h6v7h7v6h-7v7h-6v-7h-7v-6h7z" fill="#fff" />
      <circle cx="30.5" cy="10.5" r="2.5" fill="#7fe0c9" />
    </svg>
  );
}

export function AuthShell({ title, subtitle, children, wide }: { title: string; subtitle?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -right-32 h-[26rem] w-[26rem] rounded-full bg-emerald-100/70 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-48 -left-24 h-[24rem] w-[24rem] rounded-full bg-emerald-200/40 blur-3xl"
      />
      <div className={`page-in relative w-full ${wide ? "max-w-lg" : "max-w-sm"}`}>
        <div className="mb-6 flex items-center gap-3">
          <BrandMark size={40} />
          <div>
            <p className="font-[family-name:var(--font-display)] text-lg font-semibold leading-tight">Sistema de Clínicas</p>
            <p className="text-xs text-zinc-500">Gestão, agenda e atendimento</p>
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-6 shadow-[0_10px_30px_-12px_rgb(29_28_25/0.18)] sm:p-7">
          <h1 className="text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
        <p className="mt-5 text-center text-xs text-zinc-500">Dados de saúde protegidos · Conexão segura</p>
      </div>
    </main>
  );
}
