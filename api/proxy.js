export const config = {
  runtime: "nodejs"
};

function json(res, status, data) {
  return res.status(status).json(data);
}

const PROVIDERS = {
  // Groq — безкоштовний, швидкий
  "groq/llama-3.3-70b-versatile": {
    provider: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
    keyEnv: "GROQ_API_KEY"
  },
  "groq/llama-3.1-8b-instant": {
    provider: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.1-8b-instant",
    keyEnv: "GROQ_API_KEY"
  },
  // Gemini — безкоштовний, розумний
  "gemini/gemini-2.5-flash": {
    provider: "gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-2.5-flash",
    keyEnv: "GEMINI_API_KEY"
  },
  // Nvidia — безкоштовний
  "nvidia/llama-3.3-70b": {
    provider: "nvidia",
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    model: "meta/llama-3.3-70b-instruct",
    keyEnv: "NVIDIA_API_KEY"
  }
};

// Fallback order: if primary fails, try next
const FALLBACK_ORDER = [
  "groq/llama-3.3-70b-versatile",
  "gemini/gemini-2.5-flash",
  "nvidia/llama-3.3-70b"
];

function getProviderConfig(model) {
  // Direct match
  if (PROVIDERS[model]) {
    const cfg = PROVIDERS[model];
    return { ...cfg, apiKey: process.env[cfg.keyEnv] };
  }

  // Legacy short names support
  const shortMap = {
    "llama-3.3-70b": "groq/llama-3.3-70b-versatile",
    "gemini-flash": "gemini/gemini-2.5-flash"
  };

  if (shortMap[model] && PROVIDERS[shortMap[model]]) {
    const cfg = PROVIDERS[shortMap[model]];
    return { ...cfg, apiKey: process.env[cfg.keyEnv] };
  }

  return null;
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter(m => m && typeof m === "object" && m.role && m.content)
    .map(m => {
      if (Array.isArray(m.content)) {
        return {
          role: m.role,
          content: m.content
            .filter(part => part && typeof part === "object")
            .map(part => {
              if (part.type === "text") {
                return { type: "text", text: String(part.text || "") };
              }
              if (part.type === "image_url" && part.image_url?.url) {
                return { type: "image_url", image_url: { url: part.image_url.url } };
              }
              return null;
            })
            .filter(Boolean)
        };
      }
      return { role: m.role, content: String(m.content || "") };
    });
}

async function callProvider(cfg, messages, options) {
  const { temperature = 0.3, max_tokens = 600, top_p = 0.9, stream = false } = options;

  const payload = {
    model: cfg.model,
    messages,
    temperature,
    top_p,
    stream
  };

  // Groq uses max_completion_tokens
  if (cfg.provider === "groq") {
    payload.max_completion_tokens = max_tokens;
  } else {
    payload.max_tokens = max_tokens;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(cfg.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);
    return response;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const {
      model,
      messages,
      temperature = 0.3,
      max_tokens = 600,
      top_p = 0.9,
      stream = false
    } = req.body || {};

    if (!model) return json(res, 400, { error: "Missing model" });
    if (!Array.isArray(messages) || !messages.length) return json(res, 400, { error: "Missing messages" });

    const cleanMessages = sanitizeMessages(messages);
    if (!cleanMessages.length) return json(res, 400, { error: "No valid messages after sanitization" });

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
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              "Connection": "keep-alive"
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

    // Fallback: try other providers (non-streaming only for simplicity)
    for (const fallbackModel of FALLBACK_ORDER) {
      if (fallbackModel === model) continue;

      const fallbackCfg = getProviderConfig(fallbackModel);
      if (!fallbackCfg || !fallbackCfg.apiKey) continue;

      try {
        const upstream = await callProvider(fallbackCfg, cleanMessages, { ...options, stream: false });
        if (upstream.ok) {
          const data = await upstream.json();
          // Mark that fallback was used
          data._fallback = fallbackModel;
          return res.status(200).json(data);
        }
      } catch (_) {
        continue;
      }
    }

    // All failed
    return json(res, 502, {
      error: "All AI providers failed",
      lastError,
      tried: model
    });
  } catch (error) {
    if (error.name === "AbortError") {
      return json(res, 504, { error: "Request timeout (25s)" });
    }
    return json(res, 500, { error: error?.message || "Internal server error" });
  }
}
