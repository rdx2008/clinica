export const dynamic = "force-dynamic";

// Painel direito quando nenhuma conversa está aberta (no celular a lista ocupa a tela).
export default function WhatsappEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-zinc-500">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="h-14 w-14 text-zinc-300" aria-hidden="true">
        <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4A8 8 0 1 1 20 12Z" />
      </svg>
      <p className="font-[family-name:var(--font-display)] text-lg text-zinc-700">Selecione uma conversa</p>
      <p className="max-w-xs text-sm">Escolha um contato na lista ao lado para ver as mensagens e responder.</p>
    </div>
  );
}
