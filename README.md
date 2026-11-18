# Sistema de Clínicas

Gestão de clínicas (foco inicial: psicologia) com WhatsApp e IA. Escopo em [docs/ESCOPO-UNIFICADO.md](docs/ESCOPO-UNIFICADO.md).

## Estrutura

- `docs/` — escopos e MVP
- `web/` — aplicação Next.js (TypeScript, Tailwind) + Prisma/PostgreSQL
- `docker-compose.yml` — PostgreSQL 16 e Redis 7 para desenvolvimento

## Primeiros passos

1. Instale o Docker Desktop (ou um PostgreSQL 16 local) — **não estavam instalados nesta máquina**.
2. `docker compose up -d`
3. `cd web`, copie `.env.example` para `.env` e preencha `FIELD_ENCRYPTION_KEY`.
4. `npm install`
5. `npx prisma migrate dev --name init`
6. `npm run dev` → http://localhost:3000

## Primeiro acesso

Com o banco migrado e as variáveis `FIELD_ENCRYPTION_KEY` e `SESSION_SECRET` definidas, abra o sistema: a tela `/setup` cria a clínica e o primeiro administrador (some depois do primeiro cadastro). Administrador e profissional precisam ativar a verificação em duas etapas (TOTP) no primeiro login.

Testes de segurança (criptografia, senha, TOTP, sessão): `npm test` em `web/`.

## Pendências técnicas (próximas sprints)

- Migração SQL: RLS por `clinicId`, EXCLUDE constraint anti-sobreposição de horários (`btree_gist`), `audit_log` somente inserção.
- Gestão de usuários (convidar, desativar, trocar perfil) e recuperação de senha.
- Limitador de tentativas de login em Redis (hoje em memória, 1 réplica).
- Webhook idempotente do WhatsApp (Cloud API).
