# syntax=docker/dockerfile:1

# ─── Etapa 1: dependencias ────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
# Instalar TODAS las deps (incl. devDependencies como tailwindcss)
# que Next.js necesita en tiempo de build
RUN npm ci

# ─── Etapa 2: build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Las variables de entorno que Next.js necesita en BUILD TIME
# (sólo las públicas NEXT_PUBLIC_*; las secretas van en runtime)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Crear public/ si el proyecto no la tiene (evita error en COPY de la etapa runner)
RUN mkdir -p public

RUN npm run build

# ─── Etapa 3: imagen de producción ────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Deshabilita telemetría de Next.js
ENV NEXT_TELEMETRY_DISABLED=1

# Usuario sin privilegios
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copiar sólo lo necesario para ejecutar
COPY --from=builder /app/public           ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
