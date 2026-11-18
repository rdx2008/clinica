# MVP — Sistema de Gestão de Clínicas (foco: psicologia + WhatsApp)

Complementa o [ESCOPO.md](ESCOPO.md). Meta: uma clínica de psicologia (1 a 10 profissionais) operar o dia a dia só com o sistema, com confirmação de consultas por WhatsApp.

## 1. Dentro e fora do MVP

**Dentro**
1. Autenticação, clínicas (multi-tenant), usuários e perfis.
2. Pacientes e consentimentos LGPD.
3. Agenda (inclui recorrência, bloqueios e página pública de agendamento).
4. Prontuário de psicologia (evolução, anamnese, documentos básicos, anotações pessoais separadas).
5. WhatsApp: caixa de entrada, lembretes e confirmação com botões, opt-in/opt-out.
6. Financeiro básico: cobrança por sessão/pacote, Pix/link de pagamento, baixa manual, repasse simples.
7. Auditoria de acessos e dashboard simples.

**Fora (fases 2 e 3)**: agente de IA, teleconsulta, portal do paciente, NFS-e, TISS, prescrição, CRM completo, escalas/testes, assinatura ICP-Brasil.

## 2. Perfis e permissões

| Perfil | Pode |
|---|---|
| Dono/Admin | Tudo, exceto ler prontuário de outros profissionais |
| Profissional | Própria agenda, pacientes atendidos por ele, prontuário próprio, financeiro próprio |
| Recepção | Agenda de todos, cadastro, WhatsApp, cobranças; **sem acesso ao prontuário** |
| Financeiro | Cobranças, repasses, relatórios; sem prontuário |

Regra-chave: conteúdo clínico só é lido pelo profissional responsável (ou por quem ele autorizar, com registro).

## 3. Telas

1. **Login / MFA / recuperação de senha**
2. **Dashboard**: consultas de hoje, confirmadas/pendentes, faltas da semana, recebimentos em aberto, conversas sem resposta.
3. **Agenda**: visão dia/semana por profissional e sala; criar/mover/cancelar; recorrência semanal; bloqueios; lista de espera; status (agendada, confirmada, compareceu, faltou, cancelada).
4. **Pacientes**: lista com busca/tags; ficha (dados, responsável legal, consentimentos, linha do tempo, financeiro).
5. **Prontuário** (dentro da ficha, só profissional): anamnese, evoluções por sessão com templates, anexos, documentos (declaração, relatório simples), aba "anotações pessoais" privada.
6. **Caixa de entrada WhatsApp**: lista de conversas, atribuição, notas internas, vínculo com paciente, envio de template, indicador de janela de 24h.
7. **Automações**: ativar/editar régua (lembrete D-1 e H-2, confirmação, pós-falta), horários de envio, mensagens aprovadas.
8. **Financeiro**: cobranças (pendente/paga/vencida), link Pix/cartão, pacotes, repasse por profissional, fluxo de caixa mensal.
9. **Configurações**: dados da clínica, profissionais, serviços/valores/duração, salas, integração WhatsApp, templates, consentimentos, retenção de dados.
10. **Auditoria**: quem acessou/alterou o quê e quando (filtros por paciente/usuário).
11. **Página pública de agendamento** (sem login): escolher profissional/serviço/horário, dados básicos, aceite de consentimento.

## 4. Modelo de dados (PostgreSQL, todas as tabelas com `clinic_id` e RLS)

```
clinics(id, name, cnpj, timezone, settings jsonb, created_at)
users(id, clinic_id, name, email, password_hash, mfa_secret, role, active)
professionals(id, clinic_id, user_id, council_type, council_number, specialty, color)
services(id, clinic_id, name, duration_min, price_cents, modality)   -- individual, casal, grupo, online
rooms(id, clinic_id, name)

patients(id, clinic_id, full_name, birth_date, cpf_enc, phone_e164, email,
         guardian_name, guardian_phone, source, tags text[], status, created_at)
consents(id, patient_id, type, version, accepted_at, channel, ip, revoked_at)
   -- types: tratamento_dados, whatsapp_optin, termo_servico

appointments(id, clinic_id, patient_id, professional_id, service_id, room_id,
             starts_at, ends_at, status, recurrence_id, created_by, notes)
recurrences(id, rule text)                                           -- RRULE
availability(id, professional_id, weekday, start_time, end_time)
blocks(id, professional_id, starts_at, ends_at, reason)
waitlist(id, clinic_id, patient_id, professional_id, preferred jsonb)

clinical_records(id, clinic_id, patient_id, professional_id, appointment_id,
                 type, content_enc, version, signed_at, created_at)
   -- type: anamnese | evolucao | documento | anotacao_pessoal
clinical_attachments(id, record_id, file_key, mime, size)

wa_accounts(id, clinic_id, phone_number_id, waba_id, token_enc, status)
wa_templates(id, clinic_id, name, category, language, body, status)
wa_conversations(id, clinic_id, patient_id, wa_contact, assigned_to, last_msg_at, window_expires_at)
wa_messages(id, conversation_id, direction, type, body, template_id, wa_message_id, status, created_at)
automations(id, clinic_id, trigger, offset_min, template_id, active)
automation_runs(id, automation_id, appointment_id, scheduled_for, status)

charges(id, clinic_id, patient_id, appointment_id, amount_cents, due_date, status,
        method, gateway_id, paid_at)
packages(id, clinic_id, patient_id, service_id, sessions_total, sessions_used, price_cents)
payouts(id, clinic_id, professional_id, period, gross_cents, share_cents, status)

audit_log(id, clinic_id, user_id, action, entity, entity_id, ip, created_at)  -- append-only
```

Notas: campos clínicos e CPF com criptografia de campo; `audit_log` sem UPDATE/DELETE; exclusão de paciente = anonimização, respeitando prazo de guarda do prontuário.

## 5. Fluxos principais

**Lembrete e confirmação**
1. Job varre `appointments` futuras e cria `automation_runs`.
2. Envia template com botões Confirmar / Remarcar / Cancelar (só com opt-in).
3. Webhook da Cloud API recebe a resposta → atualiza status → notifica recepção se "Remarcar".

**Agendamento público**
Paciente escolhe horário livre → cria `patient` (se novo) + `consent` → `appointment` pendente → mensagem de confirmação por WhatsApp.

**Sessão e evolução**
Profissional abre consulta → marca "compareceu" → registra evolução (template) → salva com versionamento → gera cobrança automática se configurado.

**Falta**
Status "faltou" → mensagem opcional de reagendamento → entra no relatório de faltas.

## 6. Requisitos técnicos do MVP

- Stack sugerida: Next.js + API Node/TypeScript, PostgreSQL, Redis + fila (BullMQ), S3 compatível com criptografia, Cloud API da Meta (direto ou BSP).
- Webhooks idempotentes e fila com retry; deduplicar por `wa_message_id`.
- Fuso horário por clínica; todas as datas em UTC no banco.
- Backups diários, logs sem dados clínicos, MFA obrigatório para profissionais e admin.
- Testes: unidade (agenda/recorrência/conflitos), integração (webhooks WhatsApp), e2e dos fluxos acima.

## 7. Plano de entrega (≈ 16 semanas, 2 a 3 devs)

| Sprint | Entrega |
|---|---|
| 1–2 | Base: auth, multi-tenant, perfis, auditoria, cadastro de clínica/profissionais/serviços |
| 3–4 | Pacientes, consentimentos, agenda (conflitos, recorrência, bloqueios) |
| 5–6 | Prontuário de psicologia (templates, versionamento, criptografia, anotações pessoais) |
| 7–9 | WhatsApp: conexão, webhooks, caixa de entrada, templates, opt-in |
| 10–11 | Automações (lembrete/confirmação/falta) e página pública de agendamento |
| 12–14 | Financeiro básico: cobranças, Pix/link, pacotes, repasse |
| 15 | Dashboard, relatórios, endurecimento de segurança, revisão LGPD |
| 16 | Piloto com 1–2 clínicas, correções |

## 8. Critérios de sucesso do piloto

- ≥ 80% das confirmações respondidas pelo WhatsApp sem intervenção da recepção.
- Redução de faltas de pelo menos 20% frente ao histórico da clínica.
- Nenhum acesso indevido a prontuário (auditoria limpa).
- Recepção opera o dia sem planilha/agenda paralela.
- NPS interno do piloto ≥ 8.

## 9. Decisões em aberto

1. WhatsApp: integração direta com a Meta ou via BSP (custo vs. esforço).
2. Gateway de pagamento (Asaas, Mercado Pago, Pagar.me etc.).
3. Hospedagem (AWS/GCP em São Paulo) e política de retenção de prontuário.
4. Quem será a clínica-piloto.
5. Parecer jurídico sobre CFP 005/2025 antes do lançamento.
