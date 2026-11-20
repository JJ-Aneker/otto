exports.handler = async function(event, context) {

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const { wpUrl, wpPath, method, auth, body, token } = JSON.parse(event.body);

    if (!wpUrl || !wpPath) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Faltan parámetros: wpUrl, wpPath' })
      };
    }

    const url = `${wpUrl}/wp-json/wp/v2/${wpPath}`;

    // JWT token si disponible, si no Basic Auth
    let authHeader;
    if (token) {
      authHeader = 'Bearer ' + token;
    } else if (auth) {
      authHeader = 'Basic ' + Buffer.from(auth).toString('base64');
    }

    const fetchOptions = {
      method: method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { 'Authorization': authHeader })
      }
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);
    const data = await response.json();

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(data)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
