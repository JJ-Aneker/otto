# Agente de contenidos (multiusuario) — fase 1

Genera posts de blog con IA, los publica en WordPress y crea contenido de Instagram.
Cada usuario tiene **perfiles** (cliente o nicho) con su propia voz, base de conocimiento,
WordPress y **API Key de IA** (Anthropic, OpenAI, Gemini o Mistral).

## Poner en marcha en local

1. **Supabase**: crea un proyecto (región UE) → SQL Editor → pega `supabase/schema.sql` → Run.
   En *Authentication → Providers → Email* desactiva "Confirm email" mientras pruebas en local.
2. Copia `.env.example` a `.env` y rellénalo:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` (Settings → API)
   - `MASTER_KEY`: ejecuta `npm run gen-key` y pega el resultado. **Guárdala a buen recaudo:**
     si se pierde, las claves guardadas no se pueden recuperar.
3. `npm install`
4. `npm run dev` → http://localhost:3000
5. Crea tu cuenta en la pantalla de login.
6. (Opcional) Cargar el perfil de Paqui: `npm run seed:paqui -- tu@email.com`
7. En ⚙️ Configuración: completa el perfil, conecta WordPress y pega la API Key.

## Estructura
- `public/` — la web (`index.html` + `saas.js`: login, perfiles y datos)
- `api/` — funciones del servidor (formato Vercel)
- `lib/` — cifrado, proveedores de IA, utilidades
- `supabase/schema.sql` — base de datos y seguridad
- `scripts/` — servidor local, pruebas y carga del perfil de Paqui
- `netlify/`, `netlify.toml` — la versión anterior (V12), que sigue funcionando en Netlify

## Seguridad
- Las API Keys y la contraseña de WordPress se guardan **cifradas** (AES-256-GCM); el navegador nunca las recibe.
- Cada usuario solo ve sus propios datos (Row Level Security).
- `.env` nunca se sube a GitHub.
