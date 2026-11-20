// Crea el perfil de Paqui Sirvent (conocimiento, tono, calendario) en tu cuenta.
// Uso:  node scripts/seed-paqui.js tu@email.com
// Antes: crea tu cuenta desde la pantalla de login y rellena .env
const fs = require('fs'), path = require('path');
try { fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }); } catch { }
const { createClient } = require('@supabase/supabase-js');

(async () => {
  const email = (process.argv[2] || '').toLowerCase();
  if (!email) { console.error('Uso: node scripts/seed-paqui.js tu@email.com'); process.exit(1); }
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: list, error: e0 } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (e0) throw e0;
  const user = list.users.find(u => (u.email || '').toLowerCase() === email);
  if (!user) { console.error('No existe ese usuario. Crea la cuenta primero desde la pantalla de login.'); process.exit(1); }

  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'paqui-seed.json'), 'utf8'));
  const { topics, ...wsData } = seed;
  const { data: ex } = await sb.from('workspaces').select('id').eq('owner_id', user.id).eq('name', wsData.name).maybeSingle();
  if (ex) { console.log('El perfil ya existe, no se duplica.'); return; }
  const { data: ws, error } = await sb.from('workspaces').insert({ ...wsData, owner_id: user.id }).select().single();
  if (error) throw error;
  const { error: e2 } = await sb.from('topics').insert(topics.map(t => ({ ...t, workspace_id: ws.id })));
  if (e2) throw e2;
  console.log(`✓ Perfil "${ws.name}" creado con ${topics.length} temas. Entra en la app, elige el perfil y pega su API Key y la contraseña de WordPress en Configuración.`);
})().catch(e => { console.error(e.message || e); process.exit(1); });
