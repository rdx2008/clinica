# Escopo — Sistema de Gestão de Clínicas (médicas e psicológicas) com WhatsApp e IA

> Base: pesquisa de mercado (nov/2026). Fontes majoritariamente de fornecedores; preços e recursos devem ser validados em demonstrações. Pontos jurídicos devem ser confirmados nos textos oficiais (CFP, ANPD, Meta).

## 1. Panorama de mercado

| Segmento | Sistemas citados | Observações |
|---|---|---|
| Psicologia | PsicoManager, Sinappsy, Psicoplanner, Corpora, Psicodoc, Allminds, Clínica Ágil | Agenda + confirmação WhatsApp, prontuário com templates, financeiro/NF. Ponto fraco recorrente: financeiro limitado, preço "sob consulta". |
| Clínicas médicas | Feegow (Noa Notes: IA para prontuário; TISS; telemedicina), iClinic (lembretes SMS/e-mail/WhatsApp, marketing automatizado), Clinicorp (odonto: dashboards, agendamento inteligente) | Mais completos, porém focados em convênio/TISS e médico. |
| CRM/WhatsApp | Clint, SocialHub, GestãoDS, Kommo, Digisac (integra com Feegow) | Captação e reativação de pacientes; prontuário não substitui CRM. |
| Agentes de IA no WhatsApp | SleekFlow, Dealism, Aurora Inbox, Pixeon | Entendem intenção e agendam na agenda existente; ganhos citados (ex.: 45% de agendamentos feitos pela IA) são alegações de marketing. |
| Internacional (referência) | SimplePractice, TherapyNotes, Jane App | Boa referência de UX e portal do paciente. |

**Oportunidade (lacuna):** poucos produtos unem, em um só, (a) prontuário adequado às normas do CFP, (b) WhatsApp nativo com IA de agendamento, (c) CRM de captação/retenção e (d) financeiro completo (repasse, NF, convênio) para clínicas **multiprofissionais** (psicologia + médico/outros).

## 2. Visão e público

- **Produto:** SaaS multi-clínica (multi-tenant) para clínicas e consultórios, com perfis específicos para psicologia e medicina.
- **Personas:** recepção/secretária, profissional de saúde (psicólogo, médico etc.), gestor/dono da clínica, financeiro, paciente.
- **Diferenciais:** WhatsApp como canal principal; IA que atende, agenda, confirma, reduz faltas e ajuda na documentação; privacidade de dados sensíveis desde o desenho.

## 3. Módulos e requisitos funcionais

### 3.1 Cadastro e gestão de pacientes (MVP)
- Cadastro completo, responsável legal (menores), consentimentos LGPD, histórico, tags, origem do paciente.
- Linha do tempo unificada (consultas, mensagens, pagamentos, documentos).

### 3.2 Agenda (MVP)
- Multi-profissional, multi-sala, multi-unidade; consultas recorrentes (semanal de terapia), bloqueios, lista de espera, encaixe.
- Tipos de atendimento (individual, casal, grupo, online) e duração por tipo.
- Teleconsulta integrada (link de vídeo) com sala segura.
- Página pública de agendamento online por profissional.

### 3.3 Prontuário e documentos
- **Psicologia:** registro documental por sessão, evolução, anamnese, templates (TCC, infantil, etc.), documentos psicológicos (declaração, relatório, laudo, parecer, atestado) com modelos, assinatura digital; área de acesso exclusivo para instrumentos de avaliação; anotações pessoais do psicólogo separadas do prontuário.
- **Medicina:** anamnese, evolução, prescrição, atestados, solicitação de exames, CID, anexos, assinatura digital (ICP-Brasil).
- Controle de acesso por papel, trilha de auditoria (quem viu/alterou), versionamento, guarda e prazo de retenção, exportação para o paciente.
- Escalas e testes (PHQ-9, GAD-7, BDI etc.) enviáveis ao paciente pelo WhatsApp/portal, com gráfico de evolução.

### 3.4 WhatsApp (núcleo do produto)
- Integração via **WhatsApp Business Platform (Cloud API oficial da Meta)**, direto ou via BSP.
- Caixa de entrada unificada multiatendente (atribuição, transferência, notas internas, status).
- Templates aprovados: lembrete, confirmação (botões Confirmar/Remarcar/Cancelar), pós-consulta, cobrança, aniversário, reativação.
- Automações/régua: D-1/H-2, falta (no-show), pesquisa de satisfação/NPS, retorno periódico.
- Envio de links de pagamento, formulários, documentos e escalas.
- Opt-in/opt-out registrado.
- **Cuidado de custo:** cobrança por mensagem (modelo desde jul/2025); mensagens de marketing custam bem mais que utilidade, e utilidade dentro da janela de 24h deixa de ser gratuita a partir de out/2026 (a confirmar na tabela oficial da Meta). Prever painel de consumo e repasse de custo ao cliente.

### 3.5 IA
1. **Agente de atendimento no WhatsApp:** responde dúvidas (horários, valores, convênios, endereço), agenda/remarca/cancela direto na agenda, qualifica novos pacientes, transfere para humano quando necessário.
2. **Previsão de faltas e otimização de agenda:** score de risco de no-show, sugestão de overbooking e preenchimento de horários vagos pela lista de espera.
3. **Assistente de documentação (profissional):** transcrição da sessão/consulta (com consentimento), rascunho de evolução, resumo de histórico, sugestão de modelo de relatório. Sempre rascunho revisado e assinado pelo profissional.
4. **Insights de gestão:** churn de pacientes, ocupação, receita por profissional, campanhas de reativação.
5. **Triagem/risco (psicologia):** detecção de palavras-chave de risco (ideação suicida) em mensagens, com alerta imediato ao profissional e protocolo de encaminhamento. A IA **nunca** conduz atendimento clínico nem dá orientação terapêutica.

**Salvaguardas de IA:** supervisão humana obrigatória, transparência ao paciente de que fala com IA, minimização de dados enviados ao provedor de modelo, contrato sem treinamento com dados, registro de logs, desligamento por clínica/profissional.

### 3.6 Financeiro
- Cobrança por sessão, pacote, mensalidade/assinatura recorrente; Pix, cartão, boleto, link de pagamento.
- Repasse a profissionais (percentual/fixo/aluguel de sala), contas a pagar/receber, fluxo de caixa, DRE simples.
- Emissão de NFS-e; recibo para reembolso de plano; relatório para Carnê-Leão/IR.
- Convênios: faturamento e guias TISS (fase 2, para clínicas médicas).

### 3.7 CRM e marketing
- Funil de leads (WhatsApp, Instagram, site), origem, conversão, reativação de inativos, campanhas segmentadas com controle de opt-in.

### 3.8 Portal/app do paciente
- Agendamento, pagamentos, documentos, formulários, teleconsulta, histórico de agendamentos.

### 3.9 Administração e relatórios
- Perfis e permissões, multiunidade, estoque simples (fase 2), dashboards (ocupação, faltas, receita, NPS), exportação.

### 3.10 Integrações
- Google/Outlook Calendar, gateways de pagamento (Pix/cartão), emissores de NFS-e, assinatura digital (ICP-Brasil), videoconferência, contabilidade, Instagram/Meta Lead Ads, API/webhooks públicos.

## 4. Requisitos não funcionais e conformidade

- **LGPD:** dados de saúde são sensíveis — base legal, consentimento granular, DPO/encarregado, registro de operações, direitos do titular (acesso, correção, exclusão/anonimização), RIPD, plano de resposta a incidentes.
- **CFP (psicologia):** Res. 001/2009 (registro documental), 006/2019 (documentos psicológicos), 005/2025 (prontuário eletrônico; acesso do usuário e requisitos de segurança) — validar versões vigentes com assessoria especializada/CRP.
- **CFM (medicina):** normas de prontuário eletrônico e telemedicina vigentes; SBIS/CFM para certificação (se desejado).
- Segurança: criptografia em trânsito e em repouso (campos clínicos com criptografia de campo), MFA, trilha de auditoria imutável, backups, isolamento multi-tenant, hospedagem em região adequada, testes de intrusão.
- Disponibilidade ≥ 99,5%, backups diários, RPO/RTO definidos; responsivo (mobile-first para recepção e profissional).
- Acessibilidade (WCAG AA).

## 5. Arquitetura sugerida (alto nível)

- Front web (React/Next.js) + PWA; API (Node/TypeScript ou Python); PostgreSQL (multi-tenant com row-level security); fila (Redis/BullMQ) para mensagens e automações; storage de arquivos criptografado.
- Serviço de mensageria WhatsApp (webhooks da Cloud API) + orquestrador de IA com ferramentas (consultar agenda, agendar, cancelar) via function calling e guardrails.
- Observabilidade, feature flags por clínica, billing SaaS.

## 6. Roadmap

| Fase | Prazo estimado | Entregas |
|---|---|---|
| **MVP** | 3–4 meses | Cadastro, agenda, prontuário psicologia, WhatsApp (lembretes + confirmação + caixa de entrada), financeiro básico (cobrança, Pix), controle de acesso e auditoria, LGPD base. |
| **Fase 2** | +3 meses | Agente de IA de agendamento, teleconsulta, portal do paciente, repasses, NFS-e, escalas/testes, CRM básico. |
| **Fase 3** | +3 meses | Prontuário médico/prescrição, TISS/convênios, assistente de documentação por IA, previsão de no-show, relatórios avançados, API pública. |

## 7. Modelo de negócio (hipótese)

- Assinatura por profissional ativo, planos Solo / Clínica / Rede; mensagens WhatsApp e IA com franquia + excedente repassado; implantação opcional.

## 8. Riscos

- Custo e políticas do WhatsApp (aprovação de templates, categorias, banimento por spam) — exige opt-in e boas práticas.
- Responsabilidade por conteúdo gerado por IA em contexto clínico — mitigar com revisão humana e termos claros.
- Vazamento de dados sensíveis — maior risco reputacional e legal.
- Mudanças normativas (CFP/CFM/ANPD) — manter acompanhamento jurídico.

## 9. Próximos passos

1. Entrevistar 5–10 clínicas/psicólogos (dores, ferramentas atuais, disposição a pagar).
2. Demonstrações dos concorrentes (PsicoManager, Sinappsy, Feegow, iClinic) para benchmark de preço e UX.
3. Confirmar preços atuais da Meta e escolher BSP vs. integração direta.
4. Parecer jurídico sobre CFP 005/2025, LGPD e uso de IA.
5. Definir MVP e protótipo de telas (agenda, prontuário, caixa de entrada WhatsApp).

## Fontes

- [Agilize — Melhor sistema para gestão de clínica psicológica 2026](https://artigos.agilize.com.br/melhor-sistema-gestao-clinica-psicologia/)
- [Agilize — Melhor software para consultório de psicólogo 2026](https://agilize.com.br/artigos/melhor-software-gestao-psicologos-2026)
- [Clint — CRM para clínicas no WhatsApp](https://www.clint.digital/blog/?p=3494)
- [Medicina S/A — Feegow](https://medicinasa.com.br/feegow-clinic-gestao-integrada/)
- [Digisac — Integração Feegow](https://digisac.com.br/solucoes/integracoes/feegow)
- [Pixeon — Chatbot de IA para clínicas](https://www.pixeon.com/en/?p=60303)
- [Dealism — Automação de agendamento com IA](https://dealism.ai/pt/learn/healthcare-appointment-automation)
- [Meta — Pricing on the WhatsApp Business Platform](https://developers.facebook.com/docs/whatsapp/pricing)
- [Typebot — WhatsApp Business API pricing](https://typebot.com/blog/whatsapp-business-api-pricing)
- [CFP — Resolução 5/2025](https://abmes.org.br/arquivos/legislacoes/Resolucao-cfp-005-2025-02-03.pdf)
- [CFP — Resolução 6/2019](https://abmes.org.br/public/arquivos/legislacoes/Resolucao-CFP-006-2019-03-29.pdf)
- [CFP — Resolução 001/2009](https://www.rj.gov.br/degase/sites/default/files/arquivo_texto/Resolu%C3%A7%C3%A3o%2001%202009%20-%20Registros%20documentais.pdf)
