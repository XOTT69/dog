export const config = { runtime: 'nodejs' };

function json(res, status, data) {
  return res.status(status).json(data);
}

const MODEL_MAP = {
  'gemini/gemini-2.5-flash': { provider:'gemini', url:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model:'gemini-2.5-flash' },
  'groq/llama-3.3-70b-versatile': { provider:'groq', url:'https://api.groq.com/openai/v1/chat/completions', model:'llama-3.3-70b-versatile' },
  'meta/llama-3.3-70b-instruct': { provider:'nvidia', url:'https://integrate.api.nvidia.com/v1/chat/completions', model:'meta/llama-3.3-70b-instruct' },
  'google/gemma-3-27b-it': { provider:'nvidia', url:'https://integrate.api.nvidia.com/v1/chat/completions', model:'google/gemma-3-27b-it' },
  'meta/llama-3.2-90b-vision-instruct': { provider:'nvidia', url:'https://integrate.api.nvidia.com/v1/chat/completions', model:'meta/llama-3.2-90b-vision-instruct' },
  'qwen/qwen3.5-122b-a10b': { provider:'openrouter', url:'https://openrouter.ai/api/v1/chat/completions', model:'qwen/qwen-2.5-72b-instruct' }
};

function getProviderConfig(model) {
  if (!MODEL_MAP[model]) throw new Error(`Unsupported model: ${model}`);
  const cfg = MODEL_MAP[model];
  const apiKey =
    cfg.provider === 'gemini' ? process.env.GEMINI_API_KEY :
    cfg.provider === 'groq' ? process.env.GROQ_API_KEY :
    cfg.provider === 'openrouter' ? process.env.OPENROUTER_API_KEY :
    process.env.NVIDIA_API_KEY;
  return { ...cfg, apiKey };
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(m => m && m.role)
    .map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.filter(Boolean) : ''
    }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error:'Method not allowed' });

  try {
    const { model, messages, temperature = 0.2, max_tokens = 900, top_p = 0.9, stream = false } = req.body || {};
    if (!model) return json(res, 400, { error:'Missing model' });
    if (!Array.isArray(messages) || !messages.length) return json(res, 400, { error:'Missing messages' });

    const cfg = getProviderConfig(model);
    if (!cfg.apiKey) return json(res, 500, { error:`Missing API key for ${cfg.provider}` });

    const payload = { model: cfg.model, messages: sanitizeMessages(messages), temperature, top_p, max_tokens, stream };
    const headers = { 'Content-Type':'application/json', 'Authorization':`Bearer ${cfg.apiKey}` };

    if (cfg.provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://ai-beta-by.vercel.app';
      headers['X-Title'] = 'Dog Coach AI';
    }

    const upstream = await fetch(cfg.url, { method:'POST', headers, body: JSON.stringify(payload) });
    const raw = await upstream.text().catch(() => '');
    if (!upstream.ok) return json(res, upstream.status, { error: raw || `Upstream error ${upstream.status}` });

    try {
      return res.status(200).json(JSON.parse(raw));
    } catch {
      return res.status(200).send(raw);
    }
  } catch (error) {
    return json(res, 500, { error: error?.message || 'Internal server error' });
  }
}
