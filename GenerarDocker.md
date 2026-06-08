### CADA VEZ QUE GENERE UNA NUEVA VERSION, hacer esto para ejecutar en local


1- Ir a docker desktop y parar el container de XNE
2- Bajar esta imagen: docker pull ghcr.io/guskermit/xne:latest
3- Ejecutar 

docker run -p 3000:3000 \
  -e SUPABASE_INTERNAL_URL="http://host.docker.internal:54321" \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH" \
  -e DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:54322/postgres" \
  ghcr.io/guskermit/xne:latest

4- Borrar imágenes antiguas