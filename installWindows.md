# Instalar XNE en Windows con Docker

## Pre-requisitos (solo la primera vez)

**1. Instalar Docker Desktop**
Si no lo tienes aún: https://www.docker.com/products/docker-desktop/
- En la configuración, asegúrate de que está habilitado *"Use the WSL 2 based engine"*.

**2. Instalar Supabase CLI**
Abre **PowerShell como administrador**:

```powershell
# Con scoop (recomendado):
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# O con npm:
npm install -g supabase
```

---

## Cada vez que se actualiza la versión

**3. Abrir PowerShell** y entrar en una carpeta de trabajo (p.ej. `C:\xne`):
```powershell
mkdir C:\xne
cd C:\xne
```

**4. Iniciar Supabase local** (si no está ya arrancado):
```powershell
supabase start
```
Esto levantará la base de datos en `localhost:54321` y `localhost:54322`.

**5. Parar el contenedor anterior** (si ya había uno corriendo):
```powershell
docker ps
docker stop <nombre_o_id_del_contenedor_xne>
```
O desde Docker Desktop → Containers → Stop en el contenedor XNE.

**6. Descargar la imagen más reciente:**
```powershell
docker pull ghcr.io/guskermit/xne:latest
```

**7. Arrancar el contenedor:**
```powershell
docker run -p 3000:3000 `
  -e SUPABASE_INTERNAL_URL="http://host.docker.internal:54321" `
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH" `
  -e DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:54322/postgres" `
  ghcr.io/guskermit/xne:latest
```
> En PowerShell el salto de línea es `` ` `` (acento grave). En CMD usa `^` en su lugar.

**8. Abrir la aplicación** en el navegador:
```
http://localhost:3000
```

**9. Borrar imágenes antiguas** para liberar espacio:
```powershell
docker image prune -a
```

---

## Resumen rápido (cheatsheet)

```powershell
supabase start                             # 1. BD local
docker stop <id_contenedor_xne>            # 2. Para el anterior
docker pull ghcr.io/guskermit/xne:latest   # 3. Descarga la nueva
docker run -p 3000:3000 `
  -e SUPABASE_INTERNAL_URL="http://host.docker.internal:54321" `
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH" `
  -e DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:54322/postgres" `
  ghcr.io/guskermit/xne:latest             # 4. Arranca
docker image prune -a                      # 5. Limpia imágenes viejas
```
