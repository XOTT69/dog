export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { model, messages, temperature = 0.3, max_tokens = 800, top_p = 0.9 } = req.body || {};

    if (!model) return res.status(400).json({ error: 'Missing model' });
    if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'Missing messages' });

    const providers = {
      'gemini-2.5-flash': {
        url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        model: 'gemini-2.5-flash',
        key: process.env.GEMINI_API_KEY
      },
      'llama-3.3-70b': {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        model: 'llama-3.3-70b-versatile',
        key: process.env.GROQ_API_KEY
      }
    };

    const cfg = providers[model];
    if (!cfg) return res.status(400).json({ error: `Unsupported model: ${model}. Available: ${Object.keys(providers).join(', ')}` });
    if (!cfg.key) return res.status(500).json({ error: `API key not configured for ${model}` });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const upstream = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.key}`
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature,
        top_p,
        max_tokens,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    const raw = await upstream.text();

    if (!upstream.ok) {
      console.error(`Upstream error [${upstream.status}]:`, raw.slice(0, 500));
      return res.status(upstream.status).json({
        error: `Provider error (${upstream.status})`,
        detail: raw.slice(0, 200)
      });
    }

    const parsed = JSON.parse(raw);
    return res.status(200).json(parsed);
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timeout (25s)' });
    }
    console.error('Proxy error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
}
