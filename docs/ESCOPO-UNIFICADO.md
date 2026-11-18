# Escopo unificado — Gestão de clínicas com WhatsApp e IA

Fusão do escopo funcional do Codex (módulos, fluxo, critérios de aceite, privacidade) com o material técnico deste projeto ([ESCOPO.md](ESCOPO.md) e [MVP.md](MVP.md): modelo de dados, telas, arquitetura, plano, custos e riscos). Em divergência, prevaleceu o recorte mais enxuto do Codex.

## 1. Objetivo e público

Plataforma web que acompanha a jornada do paciente: primeiro contato pelo WhatsApp → agendamento → sessão e registro → cobrança.

- **Público inicial:** psicólogos autônomos e clínicas pequenas no Brasil.
- **Premissas do MVP:** atendimento particular, uma unidade por clínica, vários profissionais por unidade.
- **Expansão:** estrutura preparada para outras especialidades (medicina, fisioterapia etc.), convênios e multiunidade.
- **Diferenciais:** WhatsApp como canal principal; IA de recepção com regras claras de transferência; prontuário aderente ao CFP; privacidade de dados sensíveis desde o desenho.

## 2. Perfis e permissões

| Perfil | Acesso |
|---|---|
| Administrador | Configurações, equipe, relatórios; sem leitura de prontuário de terceiros |
| Recepção | Agenda, contatos, WhatsApp, cobranças; **sem** registros clínicos |
| Profissional | Própria agenda, pacientes vinculados, prontuário próprio, financeiro próprio |
| Financeiro | Dados necessários à cobrança e repasse; sem registros clínicos |

Registros clínicos exigem vínculo e finalidade (e autorização específica quando outro profissional precisar acessar), com registro de acesso. Dados isolados entre clínicas (multi-tenant).

## 3. Módulos do MVP

| Módulo | Entregas |
|---|---|
| **Clínica e equipe** | Equipe, horários, serviços, duração, modalidade, valores e regras de cancelamento; perfis acima. |
| **Pacientes** | Cadastro, busca, detecção de duplicidade, responsável legal, contatos autorizados, importação por planilha, exportação controlada, consentimentos LGPD e preferências de contato. |
| **Agenda** | Visão diária/semanal por profissional e sala, bloqueios, sessões avulsas e recorrentes, confirmação, remarcação, cancelamento, presença e falta; alterar sessão individual ou série futura. |
| **WhatsApp** | API oficial (Cloud API da Meta, direta ou via BSP), número da clínica, caixa de entrada compartilhada, atribuição de conversas, notas internas, lembretes e confirmações com botões, templates aprovados, indicador de janela de 24h, acompanhamento de entrega e falhas, opt-in/opt-out. |
| **IA de recepção** | Identifica-se como assistente virtual; responde dúvidas administrativas com conteúdo aprovado pela clínica; consulta horários reais; agenda **após confirmação explícita**; remarca/cancela conforme as regras da clínica; transfere à equipe em caso de pedido, ambiguidade ou demanda fora do fluxo administrativo. |
| **Prontuário psicológico** | Anamnese, avaliação da demanda, objetivos, evolução por sessão, encaminhamento, encerramento, anexos, modelos de documentos (declaração, relatório simples); autoria, data e histórico de alterações; anotações pessoais do psicólogo em área separada; acesso por perfil, vínculo e finalidade. |
| **IA de documentação (piloto opcional)** | Organiza anotações escritas em rascunho de evolução; o profissional revisa, edita e aprova antes de entrar no prontuário. Redação manual sempre disponível. |
| **Financeiro** | Contas a receber por sessão ou competência, pacotes, baixas manuais, pendências, exportação por período, repasse simples a profissionais; indicadores de sessões realizadas, faltas, valores recebidos e em aberto. |
| **Segurança e auditoria** | MFA, trilha de auditoria de acessos e exportações, dashboard simples. |

**Teleconsulta no MVP (link externo):** o profissional cadastra o link da sua sala de vídeo (Meet, Zoom etc.) no perfil; ao marcar a sessão como online, o link é anexado à consulta e incluído no lembrete do WhatsApp. O sistema não hospeda vídeo nem grava sessões. Mensagem discreta, só horário e link.

**Fora do MVP:** Pix/link de pagamento e conciliação, autoagendamento por link, sala de vídeo integrada, portal do paciente, NFS-e, TISS, prescrição, CRM completo, escalas/testes, transcrição, previsão de faltas.

## 4. Fluxo principal

1. O paciente entra em contato pelo WhatsApp. A equipe ou o assistente consulta a agenda e confirma a reserva.
2. O sistema envia lembrete e atualiza a agenda quando o paciente confirma, cancela ou pede remarcação.
3. Após o atendimento, o profissional registra e aprova a evolução. A cobrança segue a regra da clínica e aparece no financeiro.

## 5. Critérios de aceite

**Agenda e mensageria**
- Tentativas simultâneas para o mesmo horário geram uma única reserva. A confirmação só é enviada após a gravação. Reprocessar o mesmo evento mantém a reserva original (idempotência por `wa_message_id`/chave de evento).
- A remarcação só libera o horário antigo após reservar o novo e invalida lembretes antigos.
- Sem resposta do paciente, o agendamento é mantido, salvo regra explícita da clínica.
- Mensagens só são enviadas a contatos com opt-in; falhas de entrega ficam visíveis à equipe.

**IA**
- A IA pausa quando um atendente assume a conversa.
- Relatos de crise recebem resposta padronizada e seguem protocolo aprovado pelo responsável técnico, considerando a disponibilidade real da equipe.
- A IA acessa somente informações administrativas necessárias e nunca dá orientação clínica nem emite documentos.
- Ela agenda, remarca ou cancela apenas dentro das regras configuradas e após confirmação explícita do paciente.

**Acesso e prontuário**
- Recepção acessa agenda e contatos; financeiro acessa só o necessário à cobrança; registros clínicos exigem autorização específica e são isolados entre clínicas.
- A evolução final exige aprovação do profissional. Correções posteriores preservam autoria e histórico.
- Rascunhos de IA nunca entram no prontuário sem aprovação.

## 6. Privacidade e requisitos operacionais

- Mapear base legal, finalidade, acesso e retenção de cada fluxo de dados (LGPD: dados de saúde são sensíveis); encarregado/DPO, RIPD e plano de incidentes.
- Guarda definida por tipo de registro e contexto, com o responsável técnico (referências: Lei 13.787/2018, Manual do CFP; Res. CFP 001/2009, 006/2019 e 005/2025 — confirmar versões vigentes com parecer jurídico).
- Criptografia em trânsito e em repouso (campos clínicos e CPF com criptografia de campo), MFA para a equipe, auditoria imutável, testes de restauração de backup.
- Validar com fornecedores de IA: uso dos dados para treinamento (vedado por contrato), retenção e transferência internacional; minimizar dados enviados ao modelo.
- Mensagens administrativas discretas (sem detalhes clínicos); documentos entregues por canal autenticado.
- Disponibilidade ≥ 99,5%, mobile-first, acessibilidade WCAG AA.

## 7. Telas do MVP

1. Login / MFA / recuperação de senha
2. Dashboard (consultas do dia, confirmadas/pendentes, faltas, em aberto, conversas sem resposta)
3. Agenda (dia/semana, recorrência, bloqueios, status da sessão, link de vídeo nas sessões online)
4. Pacientes (lista, ficha, responsável, consentimentos, linha do tempo, importação, duplicidades)
5. Prontuário (dentro da ficha; só profissional)
6. Caixa de entrada WhatsApp (atribuição, notas, janela de 24h, indicador de IA ativa/pausada)
7. Automações (régua de lembretes, confirmação, pós-falta)
8. IA de recepção (conteúdo aprovado, regras de agenda, protocolo de crise, horários de transferência)
9. Financeiro (cobranças, pacotes, baixas, repasses, exportação)
10. Configurações (clínica, equipe, serviços, salas, WhatsApp, templates, retenção)
11. Auditoria (acessos e exportações por paciente/usuário)

## 8. Modelo de dados (PostgreSQL, `clinic_id` em todas as tabelas, RLS)

```
clinics(id, name, cnpj, timezone, settings jsonb)
users(id, clinic_id, name, email, password_hash, mfa_secret, role, active)
professionals(id, clinic_id, user_id, council_type, council_number, specialty, default_meeting_url)
services(id, clinic_id, name, duration_min, price_cents, modality, cancel_policy jsonb)
rooms(id, clinic_id, name)

patients(id, clinic_id, full_name, birth_date, cpf_enc, phone_e164, email, source, tags text[], status, dedupe_key)
guardians(id, patient_id, name, relation, phone, is_legal_guardian)
authorized_contacts(id, patient_id, name, phone, scope)
contact_preferences(id, patient_id, channel, discreet bool, quiet_hours jsonb)
consents(id, patient_id, type, version, accepted_at, channel, revoked_at)
import_jobs(id, clinic_id, file_key, status, report jsonb)

availability(id, professional_id, weekday, start_time, end_time)
blocks(id, professional_id, starts_at, ends_at, reason)
recurrences(id, rrule)
appointments(id, clinic_id, patient_id, professional_id, service_id, room_id,
             starts_at, ends_at, status, recurrence_id, source, idempotency_key UNIQUE,
             meeting_url)   -- usado quando a modalidade é online
   -- EXCLUDE constraint impede sobreposição por profissional/sala

clinical_records(id, clinic_id, patient_id, professional_id, appointment_id,
                 type, content_enc, status, version, approved_at, created_at)
   -- type: anamnese | demanda | evolucao | encaminhamento | encerramento | documento | anotacao_pessoal
   -- status: rascunho | aprovado
clinical_record_versions(id, record_id, content_enc, author_id, created_at)
clinical_attachments(id, record_id, file_key, mime, size)
clinical_access_grants(id, record_id|patient_id, grantee_id, purpose, granted_by, expires_at)

wa_accounts(id, clinic_id, phone_number_id, waba_id, token_enc, status)
wa_templates(id, clinic_id, name, category, language, body, status)
wa_conversations(id, clinic_id, patient_id, wa_contact, assigned_to, ai_state, last_msg_at, window_expires_at)
wa_messages(id, conversation_id, direction, type, body, template_id, wa_message_id UNIQUE, status, error, created_at)
automations(id, clinic_id, trigger, offset_min, template_id, active)
automation_runs(id, automation_id, appointment_id, scheduled_for, status, invalidated_at)

ai_config(id, clinic_id, approved_content jsonb, rules jsonb, crisis_protocol jsonb, handoff_hours jsonb)
ai_events(id, conversation_id, intent, action, confirmed_by_patient, handoff_reason, created_at)

charges(id, clinic_id, patient_id, appointment_id, competence, amount_cents, due_date, status, paid_at, method)
packages(id, clinic_id, patient_id, service_id, sessions_total, sessions_used, price_cents)
payouts(id, clinic_id, professional_id, period, gross_cents, share_cents, status)

audit_log(id, clinic_id, user_id, action, entity, entity_id, ip, created_at)  -- somente inserção
```

## 9. Arquitetura sugerida

- Front: Next.js (PWA). API: Node/TypeScript. PostgreSQL com RLS. Redis + fila (BullMQ) para mensagens/automações. Storage S3 criptografado, hospedagem em São Paulo.
- Webhooks da Cloud API idempotentes, com retry e deduplicação.
- Orquestrador de IA com chamadas de ferramenta (consultar horários, reservar, remarcar, cancelar, transferir), guardrails, log de decisões e chave de desligamento por clínica.
- Observabilidade, feature flags por clínica, billing SaaS.

## 10. Custos e modelo de negócio

- WhatsApp: cobrança por mensagem desde jul/2025; marketing custa bem mais que utilidade; utilidade na janela de 24h deixa de ser gratuita em out/2026 (confirmar tabela oficial da Meta). Prever painel de consumo e repasse ao cliente.
- IA: custo por conversa; franquia por plano e excedente repassado.
- Assinatura por profissional ativo (Solo / Clínica), com franquia de mensagens e IA.

## 11. Roadmap

| Fase | Prazo estimado | Entregas |
|---|---|---|
| **1. Piloto (MVP)** | ≈ 16–18 semanas, 2–3 devs | Módulos da seção 3. Medir: faltas, pedidos de agenda resolvidos pela IA, transferências à equipe, tempo até finalizar a evolução. |
| **2. Clínica particular** | +3 meses | Portal do paciente, autoagendamento por link, lista de espera, formulário pré-consulta, Pix/link e conciliação, repasses completos, assinatura digital, Receita Saúde e NFS-e, CRM básico. |
| **3. Multiprofissional** | +3 meses | Unidades e salas, modelos por especialidade, sala de vídeo integrada (condicionada à demanda do piloto; sem gravação por padrão; validar regras do CFP para atendimento online), migração de histórico, API pública, relatórios consolidados, escalas/testes, previsão de faltas, transcrição opcional após validação de privacidade. |
| **4. Convênios** | +3 meses | Elegibilidade, guias e faturamento TISS, glosas e conciliação, estoque, prescrição digital. |

Sprints do MVP: 1–2 base (auth, tenant, perfis, auditoria, equipe/serviços) · 3–4 pacientes e agenda · 5–6 prontuário · 7–9 WhatsApp · 10–11 automações e IA de recepção · 12–13 IA de documentação (piloto) e financeiro · 14–15 dashboard, segurança, revisão LGPD · 16–18 piloto e correções.

## 12. Métricas de sucesso do piloto

- ≥ 80% das confirmações respondidas sem intervenção da recepção.
- Redução de faltas ≥ 20% frente ao histórico.
- Parcela de pedidos de agenda resolvidos automaticamente pela IA e taxa de transferência à equipe (metas definidas com a clínica-piloto).
- Tempo médio até a evolução aprovada.
- Auditoria sem acesso indevido a prontuário; recepção sem agenda paralela.

## 13. Riscos

- Políticas e custo do WhatsApp (aprovação de templates, categorias, bloqueio por spam).
- Conteúdo de IA em contexto de saúde mental: crise, alucinação, expectativa do paciente — mitigar com protocolo, transferência e supervisão humana.
- Vazamento de dados sensíveis (risco legal e reputacional).
- Mudanças normativas (CFP, CFM, ANPD).

## 14. Decisões em aberto

1. WhatsApp direto com a Meta ou via BSP.
2. Provedor de IA e contrato de dados (sem treinamento, retenção, localização).
3. Protocolo de crise aprovado pelo responsável técnico da clínica-piloto.
4. Clínica-piloto e regras de cancelamento/cobrança dela.
5. Prazos de guarda de prontuário e parecer jurídico sobre CFP 005/2025.
6. Gateway de pagamento (para a fase 2).

## 15. Referências

- [PsicoManager](https://www.psicomanager.com.br/planos) · [PSIK](https://www.psik.com.br/) · [Afya iClinic](https://suporte.iclinic.com.br/pt-br/lembrete-e-confirmacao-de-consulta-via-whatsapp) · [Amplimed](https://www.amplimed.com.br/amelia-agendamento/) · [SyncMed](https://www.sync.med.br/) · [Feegow](https://feegowclinic.com.br/)
- [LGPD](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html) · [Manual do CFP](https://site.cfp.org.br/wp-content/uploads/2025/11/Manual_Orientativo.pdf) · [Lei 13.787/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13787.htm) · [Política do WhatsApp](https://whatsappbusiness.com/policy/?query=oauth)
- [Meta — preços WhatsApp](https://developers.facebook.com/docs/whatsapp/pricing) · [CFP — Res. 5/2025](https://abmes.org.br/arquivos/legislacoes/Resolucao-cfp-005-2025-02-03.pdf) · [CFP — Res. 6/2019](https://abmes.org.br/public/arquivos/legislacoes/Resolucao-CFP-006-2019-03-29.pdf)
