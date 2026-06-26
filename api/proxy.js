export const config = {
  runtime: 'nodejs',
};

import { json, verifyAuthHeader } from './_firebase-admin.js';
import { rateLimitResponse } from './_rate-limit.js';

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const PROVIDERS = {
  'groq/llama-3.3-70b-versatile': {
    provider: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    keyEnv: 'GROQ_API_KEY',
  },
  'groq/llama-3.1-8b-instant': {
    provider: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.1-8b-instant',
    keyEnv: 'GROQ_API_KEY',
  },
  'gemini/gemini-2.5-flash': {
    provider: 'gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.5-flash',
    keyEnv: 'GEMINI_API_KEY',
  },
  'nvidia/llama-3.3-70b': {
    provider: 'nvidia',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    model: 'meta/llama-3.3-70b-instruct',
    keyEnv: 'NVIDIA_API_KEY',
  },
};

const FALLBACK_ORDER = [
  'groq/llama-3.3-70b-versatile',
  'gemini/gemini-2.5-flash',
  'nvidia/llama-3.3-70b',
];

function getProviderConfig(model) {
  if (PROVIDERS[model]) {
    const cfg = PROVIDERS[model];
    return { ...cfg, apiKey: process.env[cfg.keyEnv] };
  }
  // Legacy short names
  const shortMap = {
    'llama-3.3-70b': 'groq/llama-3.3-70b-versatile',
    'gemini-flash': 'gemini/gemini-2.5-flash',
  };
  if (shortMap[model] && PROVIDERS[shortMap[model]]) {
    const cfg = PROVIDERS[shortMap[model]];
    return { ...cfg, apiKey: process.env[cfg.keyEnv] };
  }
  return null;
}

/**
 * Sanitize messages to prevent injection
 */
function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter(m => m && typeof m === 'object' && m.role && m.content)
    .slice(0, 20) // Max 20 messages per request
    .map(m => {
      // Validate role
      const validRoles = ['system', 'user', 'assistant'];
      if (!validRoles.includes(m.role)) return null;

      if (Array.isArray(m.content)) {
        return {
          role: m.role,
          content: m.content
            .filter(part => part && typeof part === 'object')
            .slice(0, 5) // Max 5 parts per message
            .map(part => {
              if (part.type === 'text') {
                return { type: 'text', text: String(part.text || '').slice(0, 4000) };
              }
              if (part.type === 'image_url' && part.image_url?.url) {
                // Only allow data URIs and https
                const url = String(part.image_url.url);
                if (url.startsWith('data:image/') || url.startsWith('https://')) {
                  return { type: 'image_url', image_url: { url } };
                }
              }
              return null;
            })
            .filter(Boolean),
        };
      }

      // Plain text content — limit length
      return {
        role: m.role,
        content: String(m.content || '').slice(0, 4000),
      };
    })
    .filter(Boolean);
}

/**
 * Validate request body parameters
 */
function validateParams(body) {
  const errors = [];

  if (!body.model || typeof body.model !== 'string') {
    errors.push('Missing or invalid model');
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    errors.push('Missing or empty messages');
  }
  if (body.temperature != null && (body.temperature < 0 || body.temperature > 2)) {
    errors.push('temperature must be 0-2');
  }
  if (body.max_tokens != null && (body.max_tokens < 1 || body.max_tokens > 4000)) {
    errors.push('max_tokens must be 1-4000');
  }

  return errors;
}

async function callProvider(cfg, messages, options) {
  const { temperature = 0.3, max_tokens = 600, top_p = 0.9, stream = false } = options;

  const payload = {
    model: cfg.model,
    messages,
    temperature,
    top_p,
    stream,
  };

  if (cfg.provider === 'groq') {
    payload.max_completion_tokens = max_tokens;
  } else {
    payload.max_tokens = max_tokens;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    // Verify authentication
    const decoded = await verifyAuthHeader(req);

    // Rate limit: 10 requests per minute per user
    if (rateLimitResponse(req, res, decoded.uid, 10, 60000)) return;

    const body = req.body || {};

    // Validate input
    const errors = validateParams(body);
    if (errors.length > 0) {
      return json(res, 400, { error: errors.join('; ') });
    }

    const {
      model,
      messages,
      temperature = 0.3,
      max_tokens = 600,
      top_p = 0.9,
      stream = false,
    } = body;

    const cleanMessages = sanitizeMessages(messages);
    if (!cleanMessages.length) {
      return json(res, 400, { error: 'No valid messages after sanitization' });
    }

    const options = { temperature, max_tokens, top_p, stream };

    // Try primary model
    let cfg = getProviderConfig(model);
    let lastError = null;

    if (cfg && cfg.apiKey) {
      try {
        const upstream = await callProvider(cfg, cleanMessages, options);

        if (upstream.ok) {
          if (stream && upstream.body) {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache, no-transform',
              Connection: 'keep-alive',
            });
            const reader = upstream.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(decoder.decode(value, { stream: true }));
            }
            res.end();
            return;
          }

          const data = await upstream.json();
          return res.status(200).json(data);
        }

        lastError = await upstream.text().catch(() => `HTTP ${upstream.status}`);
      } catch (e) {
        lastError = e.message;
      }
    } else if (!cfg) {
      lastError = `Unknown model: ${model}`;
    } else {
      lastError = `No API key for ${cfg.provider}`;
    }

    // Fallback chain
    for (const fallbackModel of FALLBACK_ORDER) {
      if (fallbackModel === model) continue;

      const fallbackCfg = getProviderConfig(fallbackModel);
      if (!fallbackCfg || !fallbackCfg.apiKey) continue;

      try {
        const upstream = await callProvider(fallbackCfg, cleanMessages, { ...options, stream: false });
        if (upstream.ok) {
          const data = await upstream.json();
          data._fallback = fallbackModel;
          return res.status(200).json(data);
        }
      } catch {
        continue;
      }
    }

    return json(res, 502, { error: 'All AI providers failed', lastError, tried: model });
  } catch (error) {
    if (error.statusCode) return json(res, error.statusCode, { error: error.message });
    if (error.name === 'AbortError') return json(res, 504, { error: 'Request timeout (25s)' });
    return json(res, 500, { error: error?.message || 'Internal server error' });
  }
}
