"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { formatPhoneBR, onlyDigits } from "@/lib/br";

export type SearchHit = { kind: "paciente" | "pagina"; label: string; hint?: string; href: string };

// Páginas acessíveis por perfil (mesmas regras do menu).
function pagesFor(role: string): SearchHit[] {
  const all: { label: string; href: string; roles: string[] }[] = [
    { label: "Início", href: "/dashboard", roles: ["ADMIN", "RECEPCAO", "PROFISSIONAL", "FINANCEIRO"] },
    { label: "Agenda", href: "/agenda/semana", roles: ["ADMIN", "RECEPCAO", "PROFISSIONAL"] },
    { label: "Novo agendamento", href: "/agenda/novo", roles: ["ADMIN", "RECEPCAO", "PROFISSIONAL"] },
    { label: "Lista de espera", href: "/agenda/espera", roles: ["ADMIN", "RECEPCAO"] },
    { label: "Pacientes", href: "/pacientes", roles: ["ADMIN", "RECEPCAO", "PROFISSIONAL"] },
    { label: "Novo paciente", href: "/pacientes/novo", roles: ["ADMIN", "RECEPCAO", "PROFISSIONAL"] },
    { label: "Financeiro", href: "/financeiro", roles: ["ADMIN", "RECEPCAO", "FINANCEIRO"] },
    { label: "Nova cobrança", href: "/financeiro/nova", roles: ["ADMIN", "RECEPCAO", "FINANCEIRO"] },
    { label: "WhatsApp", href: "/whatsapp", roles: ["ADMIN", "RECEPCAO"] },
    { label: "Relatórios", href: "/relatorios", roles: ["ADMIN"] },
    { label: "Despesas", href: "/financeiro/despesas", roles: ["ADMIN", "FINANCEIRO"] },
    { label: "Pacotes de sessões", href: "/financeiro/pacotes", roles: ["ADMIN", "FINANCEIRO", "RECEPCAO"] },
    { label: "Convênios", href: "/financeiro/convenios", roles: ["ADMIN", "FINANCEIRO"] },
    { label: "Repasses", href: "/financeiro/repasses", roles: ["ADMIN", "FINANCEIRO"] },
    { label: "Importar pacientes", href: "/pacientes/importar", roles: ["ADMIN", "RECEPCAO"] },
    { label: "Termos e contratos", href: "/configuracoes/termos", roles: ["ADMIN"] },
    { label: "Serviços", href: "/servicos", roles: ["ADMIN"] },
    { label: "Usuários", href: "/usuarios", roles: ["ADMIN"] },
    { label: "Configurações", href: "/configuracoes", roles: ["ADMIN"] },
    { label: "Auditoria", href: "/auditoria", roles: ["ADMIN"] },
    { label: "Segurança da conta", href: "/conta/seguranca", roles: ["ADMIN", "RECEPCAO", "PROFISSIONAL", "FINANCEIRO"] },
  ];
  return all.filter((p) => p.roles.includes(role)).map((p) => ({ kind: "pagina", label: p.label, href: p.href }));
}

function fold(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Busca global (Ctrl+K): páginas e pacientes. Não expõe nada além do que o perfil já acessa.
export async function globalSearchAction(query: string): Promise<SearchHit[]> {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return [];
  const q = query.trim().slice(0, 60);
  const pages = pagesFor(user.role);
  if (q.length < 2) return pages.slice(0, 8);

  const pageHits = pages.filter((p) => fold(p.label).includes(fold(q))).slice(0, 4);
  let patientHits: SearchHit[] = [];
  if (user.role !== "FINANCEIRO") {
    const digits = onlyDigits(q);
    const rows = await db.patient.findMany({
      where: {
        clinicId: user.clinicId,
        OR: [{ fullName: { contains: q, mode: "insensitive" } }, ...(digits.length >= 4 ? [{ phoneE164: { contains: digits } }] : [])],
      },
      orderBy: { fullName: "asc" },
      take: 8,
      select: { id: true, fullName: true, phoneE164: true, status: true },
    });
    patientHits = rows.map((p) => ({
      kind: "paciente" as const,
      label: p.fullName,
      hint: [p.phoneE164 ? formatPhoneBR(p.phoneE164) : null, p.status === "INATIVO" ? "inativo" : null].filter(Boolean).join(" · ") || undefined,
      href: `/pacientes/${p.id}`,
    }));
  }
  return [...patientHits, ...pageHits];
}
