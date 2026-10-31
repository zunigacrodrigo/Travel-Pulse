# Cuentas y datos en la nube (Supabase + Vercel)

La nube es **opcional**: sin estas variables la app funciona igual y todo queda en el dispositivo.

## Qué hace
Con sesión iniciada (enlace por correo, sin contraseña) se sincronizan **Travel DNA**, **destinos guardados** y el **viaje activo con su historial de deshacer**. Gana siempre la versión más reciente (se compara la fecha que viaja dentro del dato). El itinerario de demostración no se sube. Los guardados fuera del catálogo de 30 destinos se quedan en el dispositivo.

## Pasos (una sola vez)

1. **Proyecto de Supabase.** Crea uno exclusivo para Travel Pulse.
2. **Aplicar el esquema, en orden**, con la CLI (`supabase link --project-ref <ref>` y `supabase db push`) o pegando en el editor SQL:
   `0001_init.sql` → `0002_gap_view.sql` → `0003_mark_seed_prices_as_estimates.sql` → **`0004_user_cloud_data.sql`**.
   Luego carga el catálogo: `supabase/seed.sql` (los guardados dependen de que existan los destinos).
3. **Autenticación → Providers → Email:** activa el acceso por enlace mágico.
4. **Autenticación → URL Configuration:** *Site URL* = el dominio de producción; en *Redirect URLs* agrega `https://<tu-dominio>/cuenta` y, para pruebas, `http://localhost:3000/cuenta` y las URLs de previsualización de Vercel.
5. **Variables en Vercel** (Project → Settings → Environment Variables), en Production y Preview:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la clave **anon / publishable** (pública por diseño).
   - Nunca pongas la `service_role` en una variable `NEXT_PUBLIC_`: la app la rechaza, pero no dependas de eso.
   - Estas variables se leen **al compilar**: después de agregarlas, vuelve a desplegar.
6. Deploy. Abre `/cuenta`, pide el enlace con tu correo y comprueba «Sincronizar ahora».

## Seguridad (verificada con `bash supabase/tests/rls.sh`)
24 comprobaciones contra un Postgres real con el esquema `0001` + `0004`, usando dos usuarios:
cada uno solo ve y escribe lo suyo; `anon` no accede a nada; nadie puede ascenderse a `admin`;
límites de 50 viajes y 200 guardados por usuario; tamaños acotados; `delete_my_cloud_data()` borra solo lo propio.

## Lo que NO está verificado
- **No se probó contra un proyecto real de Supabase ni con el envío real de correos.** Las pruebas de navegador usan un servidor simulado con las mismas rutas y formas de respuesta de PostgREST/GoTrue.
- La entrega del correo depende del proveedor de correo de tu proyecto (el integrado de Supabase tiene límites bajos; para producción conviene un SMTP propio).
- Borrar una cuenta de acceso por completo no está en la app: «Borrar mis datos en la nube» elimina los datos, no el inicio de sesión.
- Si quitas un guardado sin red estando con sesión, la nube lo conserva y volverá en la próxima sincronización.
