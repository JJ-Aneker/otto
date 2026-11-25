// Revisión diaria de todas las webs (la lanza Vercel Cron, ver vercel.json).
// Necesita la variable CRON_SECRET en Vercel; Vercel la envía sola en la cabecera Authorization.
const { route, admin, HttpError } = require('../lib/http');
const { runSite } = require('../lib/watch');

module.exports = route(['GET', 'POST'], async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers['authorization'] !== 'Bearer ' + secret) throw new HttpError(401, 'No autorizado');
  const db = admin();
  const { data: sites, error } = await db.from('watch_sites').select('*').order('created_at').limit(200);
  if (error) throw new HttpError(500, error.message);

  const deadline = Date.now() + 50000;   // Vercel corta a los 60 s
  let done = 0;
  const queue = [...sites];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length && Date.now() < deadline) {
      const s = queue.shift();
      try {
        await runSite(db, s);
        done++;
      } catch { /* una web que falla no frena las demás */ }
    }
  }));
  // Las revisiones de más de 90 días se borran
  await db.from('watch_checks').delete().lt('checked_at', new Date(Date.now() - 90 * 86400000).toISOString());
  return { revisadas: done, pendientes: queue.length };
});
