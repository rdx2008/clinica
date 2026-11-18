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

## Pendências técnicas (próximas sprints)

- Migração SQL: RLS por `clinicId`, EXCLUDE constraint anti-sobreposição de horários (`btree_gist`), `audit_log` somente inserção.
- Autenticação com MFA e perfis.
- Criptografia de campo (CPF e conteúdo clínico).
- Webhook idempotente do WhatsApp (Cloud API).
