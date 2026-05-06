# xne

Aplicación web base con **Next.js 15 (App Router)** + **Supabase** (auth) + **Tailwind CSS**, lista para desplegar en **Vercel**.

Incluye registro (signup), inicio de sesión (login), logout y un dashboard protegido por middleware.

## 1. Requisitos

- Node.js 18.18+ (recomendado 20+)
- Una cuenta en [Supabase](https://supabase.com)
- Una cuenta en [Vercel](https://vercel.com) para el despliegue

## 2. Configurar Supabase

1. Crea un proyecto nuevo en Supabase.
2. En **Project Settings → API** copia:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. En **Authentication → URL Configuration** añade:
   - Site URL: `http://localhost:3000` (y el dominio de Vercel cuando lo tengas)
   - Redirect URLs: `http://localhost:3000/auth/callback` y `https://TU-DOMINIO.vercel.app/auth/callback`
4. Email auth viene activado por defecto. Si quieres iniciar rápido sin verificar correos, en **Authentication → Providers → Email** desactiva "Confirm email".

## 3. Variables de entorno

Copia `.env.example` a `.env.local`:

```bash
cp .env.example .env.local
```

Y rellena los valores con los de tu proyecto Supabase.

## 4. Desarrollo local

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## 5. Despliegue en Vercel

1. Sube el repo a GitHub.
2. En Vercel, "Add New → Project" e importa el repo.
3. En **Environment Variables** añade `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Deploy.
5. Vuelve a Supabase y añade el dominio definitivo a Site URL / Redirect URLs.

## Estructura

```
app/
  (auth)/
    actions.ts          # Server Actions: login / signup / logout
    login/page.tsx
    signup/page.tsx
  auth/callback/route.ts # Intercambio del code OAuth/email link
  dashboard/page.tsx    # Página protegida
  layout.tsx
  page.tsx              # Home pública
lib/supabase/
  client.ts             # Cliente para componentes 'use client'
  server.ts             # Cliente para Server Components / Actions
  middleware.ts         # Refresca sesión en cada request
middleware.ts           # Edge middleware que protege rutas
```

## Próximos pasos sugeridos

- Recuperación de contraseña
- OAuth (Google, GitHub) desde Supabase
- Tablas con Row Level Security
