FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run build

FROM base AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
# Aplica migrações pendentes e inicia o servidor.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
