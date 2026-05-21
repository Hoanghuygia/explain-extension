const ext = globalThis.browser || globalThis.chrome;
const usesPromiseApi = typeof globalThis.browser !== "undefined";

const DEFAULT_TARGET_LANGUAGE = "Vietnamese";
const DEFAULT_GEMINI_MODEL = "models/gemini-3.1-flash-lite-preview";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

const DEFAULT_PROVIDER = "gemini";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "llama3.2:3b";

const DEFAULT_PROMPTS = {
  explain: `Explain the following text in {{targetLanguage}} in a simple, clear, and easy-to-understand way.
Use a friendly but mature tone. Keep it concise and practical.
Text: "{{text}}"`,
  translate: `Translate the following text into {{targetLanguage}}.
Also include:
- Part of speech
- Short meaning
- One example sentence and its translation

Text: "{{text}}"`
};

function storageGet(defaults) {
  if (usesPromiseApi) {
    return ext.storage.local.get(defaults);
  }

  return new Promise((resolve, reject) => {
    try {
      const result = ext.storage.local.get(defaults, (items) => {
        const error = ext.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(items || defaults);
      });

      if (result && typeof result.then === "function") {
        result.then(resolve, reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}

async function loadConfig() {
  return storageGet({
    provider: DEFAULT_PROVIDER,
    geminiApiKey: "",
    geminiModel: DEFAULT_GEMINI_MODEL,
    ollamaBaseUrl: DEFAULT_OLLAMA_BASE_URL,
    ollamaModel: DEFAULT_OLLAMA_MODEL,
    targetLanguage: DEFAULT_TARGET_LANGUAGE,
    customEli5Prompt: "",
    customTranslationPrompt: ""
  });
}

function renderPrompt(template, text, targetLanguage) {
  return template
    .replaceAll("{{text}}", text)
    .replaceAll("{{targetLanguage}}", targetLanguage)
    .trim();
}

function buildPrompt(action, config, text) {
  const targetLanguage = (config.targetLanguage || DEFAULT_TARGET_LANGUAGE).trim() || DEFAULT_TARGET_LANGUAGE;
  const customPrompt = action === "explain" ? config.customEli5Prompt : config.customTranslationPrompt;
  const defaultPrompt = DEFAULT_PROMPTS[action];
  const template = (customPrompt || "").trim() || defaultPrompt;
  const prompt = renderPrompt(template, text, targetLanguage);

  if (!prompt) {
    throw new Error("The final Gemini prompt is empty. Please update your custom prompt in options.");
  }

  return prompt;
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part.text || "").join("\n").trim();
}

function normalizeGeminiModel(model) {
  const trimmedModel = (model || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
  return trimmedModel.startsWith("models/") ? trimmedModel : `models/${trimmedModel}`;
}

async function callGemini(apiKey, model, prompt) {
  const geminiModel = normalizeGeminiModel(model);
  const response = await fetch(`${GEMINI_API_BASE}/${geminiModel}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || "Gemini request failed. Please try again.";
    throw new Error(message);
  }

  const text = extractGeminiText(data);
  if (!text) {
    throw new Error("Gemini returned an empty response. Please try again.");
  }

  return text;
}

async function callOllama(baseUrl, model, prompt) {
  const response = await fetch(new URL("/api/chat", baseUrl).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || "Ollama request failed. Please try again.";
    throw new Error(message);
  }

  const text = data?.message?.content?.trim();
  if (!text) {
    throw new Error("Ollama returned an empty response. Please try again.");
  }

  return text;
}

async function callProvider(provider, config, prompt) {
  if (provider === "ollama") {
    const baseUrl = (config.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL).trim() || DEFAULT_OLLAMA_BASE_URL;
    const model = (config.ollamaModel || DEFAULT_OLLAMA_MODEL).trim() || DEFAULT_OLLAMA_MODEL;
    return callOllama(baseUrl, model, prompt);
  }

  const apiKey = (config.geminiApiKey || "").trim();
  const model = config.geminiModel || DEFAULT_GEMINI_MODEL;
  if (!apiKey) {
    throw new Error("Missing Gemini API key. Open the Explain It options page to add one.");
  }
  return callGemini(apiKey, model, prompt);
}

async function handleAction(message) {
  const action = message?.action;
  const text = (message?.text || "").trim();

  if (action !== "explain" && action !== "translate") {
    throw new Error("Unsupported Explain It action.");
  }

  if (!text) {
    throw new Error("Select some text before using Explain It.");
  }

  const config = await loadConfig();
  const provider = config.provider || DEFAULT_PROVIDER;
  const prompt = buildPrompt(action, config, text);
  const result = await callProvider(provider, config, prompt);

  return { ok: true, result };
}

ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "EXPLAIN_IT_RUN") {
    return false;
  }

  handleAction(message)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error.message || "Explain It failed. Please try again."
      });
    });

  return true;
});
