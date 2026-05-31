export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { model, messages, temperature = 0.2, max_tokens = 900, top_p = 0.9, stream = false } = req.body || {};
    if (!model) return res.status(400).json({ error: 'Missing model' });
    if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'Missing messages' });

    const map = {
      'gemini/gemini-2.5-flash': { provider: 'gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.5-flash', key: process.env.GEMINI_API_KEY },
      'groq/llama-3.3-70b-versatile': { provider: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', key: process.env.GROQ_API_KEY },
      'meta/llama-3.3-70b-instruct': { provider: 'nvidia', url: 'https://integrate.api.nvidia.com/v1/chat/completions', model: 'meta-llama-3.3-70b-instruct', key: process.env.NVIDIA_API_KEY }
    };

    const cfg = map[model];
    if (!cfg) return res.status(400).json({ error: 'Unsupported model' });
    if (!cfg.key) return res.status(500).json({ error: `Missing API key for ${cfg.provider}` });

    const upstream = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.key}`
      },
      body: JSON.stringify({ model: cfg.model, messages, temperature, top_p, max_tokens, stream })
    });

    const raw = await upstream.text().catch(() => '');
    if (!upstream.ok) return res.status(upstream.status).json({ error: raw || `Upstream error ${upstream.status}` });

    try { res.status(200).json(JSON.parse(raw)); }
    catch { res.status(200).send(raw); }
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Internal server error' });
  }
}
