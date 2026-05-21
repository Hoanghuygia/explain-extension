const optionsExt = globalThis.browser || globalThis.chrome;
const optionsUsesPromiseApi = typeof globalThis.browser !== "undefined";
const DEFAULT_TARGET_LANGUAGE = "Vietnamese";
const DEFAULT_GEMINI_MODEL = "models/gemini-3.1-flash-lite-preview";
const DEFAULT_PROVIDER = "gemini";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "llama3.2:3b";
const GEMINI_MODELS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const OLLAMA_TAGS_PATH = "/api/tags";
const OLLAMA_CHAT_PATH = "/api/chat";

const form = document.querySelector("#explain-it-options-form");
const status = document.querySelector("#status");
const modelStatus = document.querySelector("#modelStatus");
const loadModelsButton = document.querySelector("#loadModels");

const fields = {
  provider: document.querySelector("#provider"),
  geminiApiKey: document.querySelector("#geminiApiKey"),
  geminiApiKeyField: document.querySelector("#geminiApiKeyField"),
  geminiModel: document.querySelector("#geminiModel"),
  ollamaBaseUrl: document.querySelector("#ollamaBaseUrl"),
  ollamaBaseUrlField: document.querySelector("#ollamaBaseUrlField"),
  targetLanguage: document.querySelector("#targetLanguage"),
  customEli5Prompt: document.querySelector("#customEli5Prompt"),
  customTranslationPrompt: document.querySelector("#customTranslationPrompt")
};

function storageGet(defaults) {
  if (optionsUsesPromiseApi) {
    return optionsExt.storage.local.get(defaults);
  }

  return new Promise((resolve, reject) => {
    try {
      const result = optionsExt.storage.local.get(defaults, (items) => {
        const error = optionsExt.runtime.lastError;
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

function storageSet(values) {
  if (optionsUsesPromiseApi) {
    return optionsExt.storage.local.set(values);
  }

  return new Promise((resolve, reject) => {
    try {
      const result = optionsExt.storage.local.set(values, () => {
        const error = optionsExt.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve();
      });

      if (result && typeof result.then === "function") {
        result.then(resolve, reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}

function setStatus(message, type = "success") {
  status.textContent = message;
  status.dataset.type = type;
}

function setModelStatus(message, type = "success") {
  modelStatus.textContent = message;
  modelStatus.dataset.type = type;
}

function getSelectedProvider() {
  return fields.provider?.value || DEFAULT_PROVIDER;
}

function providerRequiresApiKey(provider) {
  return provider === "gemini";
}

function getModelsForProvider(provider) {
  return provider === "gemini" ? fields.geminiModel.dataset.models : fields.geminiModel.dataset.ollamaModels;
}

function setModelsForProvider(provider, models) {
  if (provider === "gemini") {
    fields.geminiModel.dataset.models = JSON.stringify(models || []);
  } else {
    fields.geminiModel.dataset.ollamaModels = JSON.stringify(models || []);
  }
}

function createModelLabel(model) {
  return model.displayName ? `${model.displayName} (${model.name})` : model.name;
}

function setModelOptions(models, selectedModel) {
  fields.geminiModel.textContent = "";

  if (!models.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No generateContent models found";
    fields.geminiModel.append(option);
    fields.geminiModel.disabled = true;
    return;
  }

  models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model.name;
    option.textContent = createModelLabel(model);
    fields.geminiModel.append(option);
  });

  fields.geminiModel.disabled = false;
  fields.geminiModel.value = selectedModel && models.some((model) => model.name === selectedModel)
    ? selectedModel
    : models[0].name;
}

function showSavedModelOption(modelName) {
  fields.geminiModel.textContent = "";

  const option = document.createElement("option");
  option.value = modelName;
  option.textContent = modelName ? `Saved model: ${modelName}` : "Enter an API key to load supported models";
  fields.geminiModel.append(option);
  fields.geminiModel.disabled = !modelName;
}

async function fetchGeminiModels(apiKey) {
  const models = [];
  let pageToken = "";

  do {
    const url = new URL(GEMINI_MODELS_ENDPOINT);
    url.searchParams.set("key", apiKey);
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url.toString());
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = data?.error?.message || "Could not load Gemini models.";
      throw new Error(message);
    }

    models.push(...(data.models || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return models.filter((model) => {
    return (model.supportedGenerationMethods || []).includes("generateContent");
  });
}

async function fetchOllamaModels(baseUrl) {
  const response = await fetch(new URL(OLLAMA_TAGS_PATH, baseUrl).toString());
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error || "Could not load Ollama models.";
    throw new Error(message);
  }

  return (data.models || []).map((model) => ({ name: model.name }));
}

async function testOllamaModel(baseUrl, model) {
  const response = await fetch(new URL(OLLAMA_CHAT_PATH, baseUrl).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: "user", content: "Say OK only." }]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || "Ollama request failed.";
    throw new Error(message);
  }
}

async function loadGeminiModels() {
  const apiKey = fields.geminiApiKey.value.trim();

  if (!apiKey) {
    showSavedModelOption(fields.geminiModel.value);
    setModelStatus("Enter your Gemini API key first.", "error");
    return;
  }

  loadModelsButton.disabled = true;
  fields.geminiModel.disabled = true;
  setModelStatus("Loading models...");

  try {
    const selectedModel = fields.geminiModel.value;
    const models = await fetchGeminiModels(apiKey);
    setModelOptions(models, selectedModel);
    setModelsForProvider("gemini", models);
    setModelStatus(`${models.length} supported models loaded.`);
  } catch (error) {
    showSavedModelOption(fields.geminiModel.value);
    setModelStatus(error.message || "Could not load Gemini models.", "error");
  } finally {
    loadModelsButton.disabled = false;
  }
}

async function loadModelsForProvider(provider) {
  if (provider === "gemini") {
    await loadGeminiModels();
    return;
  }

  const baseUrl = (fields.ollamaBaseUrl.value || DEFAULT_OLLAMA_BASE_URL).trim();
  if (!baseUrl) {
    setModelStatus("Enter your Ollama base URL first.", "error");
    return;
  }

  loadModelsButton.disabled = true;
  fields.geminiModel.disabled = true;
  setModelStatus("Loading models...");

  try {
    const selectedModel = fields.geminiModel.value;
    const models = await fetchOllamaModels(baseUrl);
    setModelOptions(models, selectedModel);
    setModelsForProvider("ollama", models);
    setModelStatus(`${models.length} Ollama models loaded.`);
  } catch (error) {
    showSavedModelOption(fields.geminiModel.value);
    setModelStatus(error.message || "Could not load Ollama models.", "error");
  } finally {
    loadModelsButton.disabled = false;
  }
}

async function testProviderModel(provider, model) {
  if (provider === "gemini") {
    await loadGeminiModels();
    return;
  }

  const baseUrl = (fields.ollamaBaseUrl.value || DEFAULT_OLLAMA_BASE_URL).trim();
  await testOllamaModel(baseUrl, model);
}

function applyProviderUI(provider) {
  const needsKey = providerRequiresApiKey(provider);
  fields.geminiApiKeyField.classList.toggle("is-hidden", !needsKey);
  fields.ollamaBaseUrlField.classList.toggle("is-hidden", provider !== "ollama");
}

async function loadOptions() {
  const config = await storageGet({
    provider: DEFAULT_PROVIDER,
    geminiApiKey: "",
    geminiModel: DEFAULT_GEMINI_MODEL,
    ollamaBaseUrl: DEFAULT_OLLAMA_BASE_URL,
    ollamaModel: DEFAULT_OLLAMA_MODEL,
    targetLanguage: DEFAULT_TARGET_LANGUAGE,
    customEli5Prompt: "",
    customTranslationPrompt: ""
  });

  fields.provider.value = config.provider || DEFAULT_PROVIDER;
  fields.geminiApiKey.value = config.geminiApiKey || "";
  showSavedModelOption(config.geminiModel || DEFAULT_GEMINI_MODEL);
  fields.ollamaBaseUrl.value = config.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL;
  fields.targetLanguage.value = config.targetLanguage || DEFAULT_TARGET_LANGUAGE;
  fields.customEli5Prompt.value = config.customEli5Prompt || "";
  fields.customTranslationPrompt.value = config.customTranslationPrompt || "";

  const provider = getSelectedProvider();
  applyProviderUI(provider);

  if (provider === "gemini" && (config.geminiApiKey || "").trim()) {
    await loadModelsForProvider(provider);
  }
}

loadModelsButton.addEventListener("click", () => {
  void loadModelsForProvider(getSelectedProvider());
});

fields.geminiApiKey.addEventListener("change", () => {
  if (getSelectedProvider() === "gemini") {
    void loadModelsForProvider("gemini");
  }
});

fields.provider.addEventListener("change", async () => {
  const provider = getSelectedProvider();
  applyProviderUI(provider);
  await loadModelsForProvider(provider);
});

fields.ollamaBaseUrl.addEventListener("change", async () => {
  if (getSelectedProvider() === "ollama") {
    await loadModelsForProvider("ollama");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Saving...");

  const targetLanguage = fields.targetLanguage.value.trim() || DEFAULT_TARGET_LANGUAGE;
  const provider = getSelectedProvider();
  const geminiModel = fields.geminiModel.value || DEFAULT_GEMINI_MODEL;
  const ollamaModel = fields.geminiModel.value || DEFAULT_OLLAMA_MODEL;

  try {
    await storageSet({
      provider,
      geminiApiKey: fields.geminiApiKey.value.trim(),
      geminiModel,
      ollamaBaseUrl: fields.ollamaBaseUrl.value.trim() || DEFAULT_OLLAMA_BASE_URL,
      ollamaModel,
      targetLanguage,
      customEli5Prompt: fields.customEli5Prompt.value.trim(),
      customTranslationPrompt: fields.customTranslationPrompt.value.trim()
    });

    fields.geminiModel.value = geminiModel;
    fields.targetLanguage.value = targetLanguage;
    fields.customEli5Prompt.value = fields.customEli5Prompt.value.trim();
    fields.customTranslationPrompt.value = fields.customTranslationPrompt.value.trim();
    setStatus("Options saved.");
  } catch (error) {
    setStatus(error.message || "Could not save options.", "error");
  }
});

loadOptions().catch((error) => {
  setStatus(error.message || "Could not load options.", "error");
});
