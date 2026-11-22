// Modelos iniciais de termos e contratos. A clínica deve revisar com o responsável técnico e o jurídico antes de usar.

export type TermTemplate = { key: string; kind: "TCLE" | "CONTRATO"; title: string; body: string };

export function fillTerm(body: string, vars: { clinica: string; cnpj?: string; paciente?: string; data?: string }): string {
  return body
    .replace(/\{clinica\}/g, vars.clinica)
    .replace(/\{cnpj\}/g, vars.cnpj ?? "")
    .replace(/\{paciente\}/g, vars.paciente ?? "")
    .replace(/\{data\}/g, vars.data ?? "");
}

export const TERM_TEMPLATES: TermTemplate[] = [
  {
    key: "tcle",
    kind: "TCLE",
    title: "Termo de consentimento para atendimento psicológico e tratamento de dados",
    body: [
      "TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO",
      "",
      "{clinica}{cnpj}",
      "",
      "1. Natureza do serviço. O atendimento psicológico é realizado por profissional habilitado, com base no Código de Ética Profissional do Psicólogo e nas normas do Conselho Federal de Psicologia. Os resultados dependem do processo e do envolvimento de ambas as partes e não podem ser garantidos.",
      "",
      "2. Sigilo. As informações compartilhadas nos atendimentos são sigilosas. O sigilo só pode ser quebrado nas hipóteses previstas em lei e no Código de Ética, como risco grave à vida ou à integridade da pessoa ou de terceiros, e sempre limitado ao mínimo necessário.",
      "",
      "3. Registro. O profissional mantém registro documental dos atendimentos (prontuário), guardado de forma segura e criptografada, pelo prazo previsto em norma, acessível apenas ao profissional responsável.",
      "",
      "4. Tratamento de dados pessoais (LGPD). Seus dados cadastrais e de saúde são tratados para a prestação do serviço, a gestão da agenda e das cobranças e o cumprimento de obrigações legais. Você pode solicitar acesso, correção, portabilidade e anonimização dos dados cadastrais, observados os prazos legais de guarda do prontuário.",
      "",
      "5. Comunicação. Lembretes e avisos podem ser enviados por WhatsApp ou e-mail, somente com a sua autorização, que pode ser revogada a qualquer momento.",
      "",
      "6. Atendimento on-line. Quando o atendimento for por videochamada, ambas as partes devem garantir um ambiente reservado. Não é permitido gravar as sessões sem autorização expressa.",
      "",
      "Declaro que li e compreendi este termo e consinto com o atendimento nas condições descritas.",
    ].join("\n"),
  },
  {
    key: "contrato",
    kind: "CONTRATO",
    title: "Contrato terapêutico (combinados do atendimento)",
    body: [
      "CONTRATO TERAPÊUTICO",
      "",
      "{clinica}{cnpj}",
      "",
      "1. Sessões. As sessões têm duração definida no agendamento e frequência combinada entre paciente e profissional.",
      "",
      "2. Horários e atrasos. Em caso de atraso, a sessão termina no horário previsto, para não prejudicar os atendimentos seguintes.",
      "",
      "3. Cancelamento e remarcação. Cancelamentos e remarcações devem ser comunicados com pelo menos 24 horas de antecedência. Faltas ou cancelamentos fora desse prazo poderão ser cobrados, conforme a política da clínica.",
      "",
      "4. Pagamento. O pagamento é feito conforme combinado (Pix, cartão ou dinheiro). Pacotes de sessões seguem as condições informadas na contratação.",
      "",
      "5. Contato entre sessões. Em situações de urgência ou risco, procure o CVV (188), o SAMU (192) ou o pronto-socorro mais próximo. Mensagens enviadas fora do horário de atendimento serão respondidas no próximo dia útil.",
      "",
      "6. Encerramento. O acompanhamento pode ser encerrado por qualquer das partes, preferencialmente com uma sessão de fechamento.",
      "",
      "Declaro que li, compreendi e concordo com os combinados acima.",
    ].join("\n"),
  },
];
