# Guia de deploy no Coolify

Repositório: `https://github.com/rdx2008/clinica.git` (branch `main`). O app fica na pasta `web/`.

> O sistema trata dados de saúde. Use sempre HTTPS, guarde as chaves em local seguro e faça o primeiro acesso **antes** de divulgar o endereço.

## 1. Gerar os segredos (no seu computador)

Rode cada comando e guarde os valores num gerenciador de senhas.

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
→ `FIELD_ENCRYPTION_KEY` (**faça backup**: sem ela, CPF, mensagens e prontuário ficam ilegíveis para sempre)

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
→ gere um valor para cada: `SESSION_SECRET`, `CRON_SECRET`, `WHATSAPP_VERIFY_TOKEN` e `SETUP_TOKEN`.

## 2. Criar o banco (primeiro)

1. No Coolify: **Resources → New → Database → PostgreSQL 16**.
2. Anote a **URL interna** (Postgres URL internal). Ela será o `DATABASE_URL`.
3. Ative **backups agendados** do banco (diários) e teste uma restauração antes de usar com dados reais.

As migrações usam a extensão `btree_gist`. O usuário padrão do Postgres do Coolify é administrador e consegue criá-la sozinho.

## 3. Criar a aplicação

1. **New → Application → Public/Private Repository**, informe o repositório e a branch `main`.
2. **Build Pack:** Dockerfile.
3. **Base Directory:** `/web`.
4. **Porta exposta:** `3000`.
5. **Domínio:** informe o domínio com `https://` (o Coolify emite o certificado).
6. Em **Environment Variables**, cadastre:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | URL interna do Postgres (passo 2) |
| `FIELD_ENCRYPTION_KEY` | gerada no passo 1 |
| `SESSION_SECRET` | gerada no passo 1 (mín. 32 caracteres) |
| `SETUP_TOKEN` | gerada no passo 1 |
| `CRON_SECRET` | gerada no passo 1 |
| `WHATSAPP_VERIFY_TOKEN` | gerada no passo 1 |
| `WHATSAPP_APP_SECRET` | segredo do app na Meta (passo 6) |
| `ANTHROPIC_API_KEY` | opcional: só se for usar a IA de recepção |
| `AI_MODEL` | opcional (padrão `claude-haiku-5-5`) |

`REDIS_URL` ainda não é usado. Não marque as variáveis acima como "somente build": o app precisa delas em execução.

7. **Healthcheck:** na aba *Healthcheck* da aplicação, ative com método GET, porta `3000` e caminho `/api/health`. Assim o Coolify só troca a versão antiga quando a nova está saudável.
8. **Deploy.** Ao subir, o container aplica as migrações (`prisma migrate deploy`) e inicia o servidor. Se o deploy falhar, veja o log: o erro mais comum é `DATABASE_URL` incorreta.

## 4. Primeiro acesso

1. Abra `https://SEU-DOMINIO/setup`.
2. Informe nome da clínica, seu nome, e-mail, senha (mín. 12 caracteres) e o `SETUP_TOKEN`.
3. Configure o MFA (aplicativo autenticador) quando for pedido.
4. Depois do cadastro, a tela `/setup` deixa de funcionar. Você pode remover o `SETUP_TOKEN`.

Em seguida, cadastre:
- **Usuários** (profissionais e recepção). Cada um troca a senha provisória e configura o MFA no primeiro acesso.
- **Serviços** (tipo de atendimento, duração, valor, modalidade).
- **Horários de atendimento** de cada profissional (Agenda → Horários de atendimento).

## 5. Lembretes automáticos (agendador)

No Coolify, na aplicação: **Scheduled Tasks → Add**.

- **Frequência:** `*/10 * * * *` (a cada 10 minutos)
- **Comando:**

```
wget -qO- --post-data='' --header="Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/lembretes
```

A mesma chamada executa três rotinas: lembretes de consulta, avisos de pendência do portal (questionário, tarefa e termo) e a atualização das notas de lote de convênio emitidas pelo Asaas. A resposta traz a contagem de cada uma.

Para o aviso de pendências o sistema precisa saber o endereço público: ele usa a variável `APP_URL` (ex.: `https://clinica.exemplo.com.br`) e, se ela não existir, a `COOLIFY_URL` que o Coolify injeta. Também é preciso ter o endereço do portal (slug) configurado em Configurações.

## 6. WhatsApp (Meta)

1. Crie um app em *Meta for Developers* com o produto **WhatsApp** e uma conta WhatsApp Business.
2. Copie o **Segredo do app** (App Secret) para `WHATSAPP_APP_SECRET` e faça redeploy.
3. Crie um **token de acesso permanente** (usuário do sistema) e anote o *Phone number ID* e o *WABA ID*.
4. Em **WhatsApp → Configuração → Webhook**:
   - URL de callback: `https://SEU-DOMINIO/api/whatsapp/webhook`
   - Token de verificação: o valor de `WHATSAPP_VERIFY_TOKEN`
   - Assine o campo `messages`.
5. No sistema (menu WhatsApp → Configuração), informe Phone number ID, WABA ID e o token.
6. Cadastre os modelos de mensagem na Meta e registre-os em *Modelos e lembretes* com o mesmo nome e texto. Marque como **Aprovado** quando a Meta aprovar. Variáveis dos lembretes: `{{1}}` nome, `{{2}}` data, `{{3}}` hora, `{{4}}` profissional.
7. Preços por mensagem e regras de janela de 24 h: confirme na documentação atual da Meta.

## 7. IA de recepção (opcional)

Antes de ligar, em **WhatsApp → IA**: preencher o conteúdo aprovado (horários, endereço, serviços, valores), revisar com o responsável clínico a mensagem de crise e confirmar com o responsável de privacidade a base legal e o contrato de tratamento de dados com o provedor do modelo (LGPD).

## 8. Checklist depois do deploy

- [ ] `https://SEU-DOMINIO/setup` concluído e MFA ativo no administrador
- [ ] Backup do banco agendado **e** restauração testada
- [ ] `FIELD_ENCRYPTION_KEY` guardada fora do servidor
- [ ] Tarefa agendada dos lembretes criada
- [ ] Webhook do WhatsApp verificado pela Meta (aparece como verificado no painel)
- [ ] Mensagem de teste enviada e recebida na caixa de entrada
- [ ] Um agendamento criado e visível na agenda do profissional
- [ ] Termos de uso, política de privacidade e RIPD/DPO providenciados pela clínica

## 9. Atualizações e problemas comuns

- **Atualizar:** envie o código para `main` e faça redeploy. Migrações novas rodam sozinhas ao iniciar.
- **Migrações não são desfeitas automaticamente.** Antes de atualizações com mudança de banco, faça backup.
- **Limite de login em memória:** use **uma única réplica** da aplicação.
- **Erro de extensão `btree_gist`:** o usuário do banco precisa de permissão para criar extensões (ou peça ao administrador do banco para executar `CREATE EXTENSION btree_gist;`).
- **Webhook responde 401:** `WHATSAPP_APP_SECRET` diferente do segredo do app na Meta.
- **Webhook responde 403 na verificação:** `WHATSAPP_VERIFY_TOKEN` diferente do digitado no painel.
- **IA não responde:** falta `ANTHROPIC_API_KEY`, a IA está desligada em WhatsApp → IA, ou a conversa foi transferida/assumida por uma pessoa.

## 10. Pix, nota fiscal (NFS-e) e portal do paciente

**Gateway (Asaas)**
1. Crie a conta no Asaas e gere a chave de API (comece pelo *sandbox*).
2. No sistema: *Configurações → Pagamentos e nota fiscal*. Informe ambiente, chave e os dados fiscais padrão (serviço municipal, alíquota de ISS, descrição).
3. Clique em *Testar conexão* e depois em *Cadastrar webhook no Asaas* (o sistema gera o segredo do webhook sozinho).
4. Em *Financeiro*, cada cobrança pendente ganha *Gerar Pix*; cobranças pagas ganham *Emitir NFS-e* (nota de serviço, não de produto).
5. Para a NFS-e funcionar, a prefeitura precisa aceitar emissão por integração e os dados fiscais devem estar completos no Asaas. Confirme com o contador.

**Portal do paciente**
1. *Configurações → Portal do paciente*: defina o endereço (ex.: `minha-clinica` → `/p/minha-clinica`).
2. Para o link por e-mail, defina no Coolify: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (e `SMTP_SECURE=true` se a porta for 465). Sem isso, gere o link manualmente na ficha do paciente.
3. Informe a política de privacidade: nome e CPF do paciente são enviados ao Asaas ao gerar cobranças.

**Anexos do prontuário** ficam no próprio banco, criptografados (PDF, imagem e áudio de até 10 MB). O backup do banco já os inclui.
