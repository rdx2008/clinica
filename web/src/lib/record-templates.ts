// Modelos prontos de registro e documentos (texto-base com variáveis). Sem dependências internas.

export type TemplateType = "ANAMNESE" | "DEMANDA" | "EVOLUCAO" | "ENCAMINHAMENTO" | "ENCERRAMENTO" | "DOCUMENTO" | "ANOTACAO_PESSOAL";

export type BaseTemplate = { name: string; type: TemplateType; content: string };

export const TEMPLATE_VARS = ["{paciente}", "{data}", "{profissional}", "{registro}", "{clinica}", "{cidade}"] as const;

// Preenche as variáveis; as desconhecidas ficam como estão para o profissional completar.
export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars && vars[k] ? vars[k] : m));
}

export const DEFAULT_TEMPLATES: BaseTemplate[] = [
  {
    name: "Anamnese inicial (psicologia)",
    type: "ANAMNESE",
    content: [
      "IDENTIFICAÇÃO",
      "Paciente: {paciente}",
      "Data: {data}",
      "",
      "QUEIXA PRINCIPAL / DEMANDA",
      "",
      "HISTÓRIA DA QUEIXA ATUAL",
      "",
      "HISTÓRICO FAMILIAR E SOCIAL",
      "",
      "HISTÓRICO DE SAÚDE (físico e emocional, medicações)",
      "",
      "TRATAMENTOS ANTERIORES",
      "",
      "EXPECTATIVAS EM RELAÇÃO AO ATENDIMENTO",
      "",
      "HIPÓTESES INICIAIS E PLANO DE ACOMPANHAMENTO",
    ].join("\n"),
  },
  {
    name: "Evolução de sessão (SOAP)",
    type: "EVOLUCAO",
    content: [
      "Data: {data}",
      "",
      "S — Relato do paciente:",
      "",
      "O — Observações do profissional (comportamento, afeto, discurso):",
      "",
      "A — Avaliação / formulação:",
      "",
      "P — Plano e encaminhamentos para a próxima sessão:",
    ].join("\n"),
  },
  {
    name: "Evolução de sessão (livre)",
    type: "EVOLUCAO",
    content: "Data: {data}\n\nTemas trabalhados:\n\nIntervenções:\n\nObservações e próximos passos:\n",
  },
  {
    name: "Encaminhamento",
    type: "ENCAMINHAMENTO",
    content: [
      "Encaminho {paciente} para avaliação/acompanhamento em ______________________.",
      "",
      "Motivo do encaminhamento:",
      "",
      "Informações relevantes (respeitando o sigilo profissional):",
      "",
      "{cidade}, {data}.",
      "{profissional} — {registro}",
    ].join("\n"),
  },
  {
    name: "Encerramento do acompanhamento",
    type: "ENCERRAMENTO",
    content: [
      "Paciente: {paciente}",
      "Data do encerramento: {data}",
      "",
      "Motivo do encerramento:",
      "",
      "Síntese do processo e evolução:",
      "",
      "Orientações finais / encaminhamentos:",
    ].join("\n"),
  },
  {
    name: "Declaração de comparecimento",
    type: "DOCUMENTO",
    content: [
      "DECLARAÇÃO DE COMPARECIMENTO",
      "",
      "Declaro, para os devidos fins, que {paciente} compareceu a atendimento psicológico em {data}, no horário das ____ às ____.",
      "",
      "{cidade}, {data}.",
      "",
      "{profissional}",
      "{registro}",
    ].join("\n"),
  },
  {
    name: "Atestado psicológico",
    type: "DOCUMENTO",
    content: [
      "ATESTADO PSICOLÓGICO",
      "",
      "Atesto que {paciente} encontra-se em acompanhamento psicológico, com necessidade de ______________________, pelo período de ______________________.",
      "",
      "Este documento não contém informações sobre diagnóstico ou conteúdo das sessões, em respeito ao sigilo profissional.",
      "",
      "{cidade}, {data}.",
      "",
      "{profissional}",
      "{registro}",
    ].join("\n"),
  },
  {
    name: "Relatório psicológico",
    type: "DOCUMENTO",
    content: [
      "RELATÓRIO PSICOLÓGICO",
      "",
      "1. IDENTIFICAÇÃO",
      "Paciente: {paciente}",
      "Solicitante: ______________________",
      "Finalidade: ______________________",
      "",
      "2. DESCRIÇÃO DA DEMANDA",
      "",
      "3. PROCEDIMENTO",
      "",
      "4. ANÁLISE",
      "",
      "5. CONCLUSÃO",
      "",
      "{cidade}, {data}.",
      "",
      "{profissional}",
      "{registro}",
    ].join("\n"),
  },
];
