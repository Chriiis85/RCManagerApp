module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Obtenemos el path desde la query (enviado por vercel.json) o desde la URL
  const path = req.query.path || req.url.replace('/api/proxy', '').split('?')[0].replace(/^\/+/g, '');
  const targetUrl = `https://queue-times.com/${path}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Error in queue-times.com', status: response.status });
    }

    const data = await response.json();
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};
