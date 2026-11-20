// Lista la biblioteca de imágenes de WordPress del perfil.
const { route, requireUser, loadWorkspace, HttpError } = require('../lib/http');

module.exports = route(['POST'], async (req, body) => {
  const user = await requireUser(req);
  const ws = await loadWorkspace(user, body.workspaceId);
  if (!ws.wp_url) throw new HttpError(400, 'Falta la URL de WordPress en el perfil');
  const { token, page = 1, perPage = 50, search = '' } = body;

  const params = new URLSearchParams({
    per_page: perPage, page, media_type: 'image', orderby: 'date', order: 'desc',
    ...(search && { search })
  });
  const r = await fetch(`${ws.wp_url.replace(/\/$/, '')}/wp-json/wp/v2/media?${params}`, {
    headers: token ? { Authorization: 'Bearer ' + token } : {}
  });
  const data = await r.json().catch(() => []);
  const images = Array.isArray(data) ? data.map(img => ({
    id: img.id,
    title: img.title?.rendered || '',
    filename: img.source_url?.split('/').pop() || '',
    url: img.source_url,
    thumbnail: img.media_details?.sizes?.thumbnail?.source_url || img.source_url,
    medium: img.media_details?.sizes?.medium?.source_url || img.source_url,
    alt: img.alt_text || '',
    caption: img.caption?.rendered || '',
    date: img.date,
    width: img.media_details?.width || 0,
    height: img.media_details?.height || 0
  })) : [];
  return {
    images,
    total: parseInt(r.headers.get('X-WP-Total') || 0),
    totalPages: parseInt(r.headers.get('X-WP-TotalPages') || 1),
    page
  };
});
