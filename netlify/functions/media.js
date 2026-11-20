exports.handler = async function(event, context) {

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const { wpUrl, token, auth, page = 1, perPage = 50, search = '' } = JSON.parse(event.body);

    let authHeader;
    if (token) authHeader = 'Bearer ' + token;
    else if (auth) authHeader = 'Basic ' + Buffer.from(auth).toString('base64');

    const params = new URLSearchParams({
      per_page: perPage,
      page: page,
      media_type: 'image',
      orderby: 'date',
      order: 'desc',
      ...(search && { search })
    });

    const response = await fetch(`${wpUrl}/wp-json/wp/v2/media?${params}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { 'Authorization': authHeader })
      }
    });

    const data = await response.json();
    const total = response.headers.get('X-WP-Total') || 0;
    const totalPages = response.headers.get('X-WP-TotalPages') || 1;

    // Simplify the response — only what we need
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
      height: img.media_details?.height || 0,
    })) : [];

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ images, total: parseInt(total), totalPages: parseInt(totalPages), page })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
