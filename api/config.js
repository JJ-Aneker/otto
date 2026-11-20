// Datos públicos que el navegador necesita para iniciar sesión con Supabase.
const { route } = require('../lib/http');
module.exports = route(['GET'], async () => ({
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
}));
