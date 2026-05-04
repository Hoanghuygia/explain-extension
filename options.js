const optionsExt = globalThis.browser || globalThis.chrome;
const optionsUsesPromiseApi = typeof globalThis.browser !== "undefined";
const DEFAULT_TARGET_LANGUAGE = "Vietnamese";
const DEFAULT_GEMINI_MODEL = "models/gemini-3.1-flash-lite-preview";
const GEMINI_MODELS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const form = document.querySelector("#explain-it-options-form");
const status = document.querySelector("#status");
const modelStatus = document.querySelector("#modelStatus");
const loadModelsButton = document.querySelector("#loadModels");

const fields = {
  geminiApiKey: document.querySelector("#geminiApiKey"),
  geminiModel: document.querySelector("#geminiModel"),
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
    setModelStatus(`${models.length} supported models loaded.`);
  } catch (error) {
    showSavedModelOption(fields.geminiModel.value);
    setModelStatus(error.message || "Could not load Gemini models.", "error");
  } finally {
    loadModelsButton.disabled = false;
  }
}

async function loadOptions() {
  const config = await storageGet({
    geminiApiKey: "",
    geminiModel: DEFAULT_GEMINI_MODEL,
    targetLanguage: DEFAULT_TARGET_LANGUAGE,
    customEli5Prompt: "",
    customTranslationPrompt: ""
  });

  fields.geminiApiKey.value = config.geminiApiKey || "";
  showSavedModelOption(config.geminiModel || DEFAULT_GEMINI_MODEL);
  fields.targetLanguage.value = config.targetLanguage || DEFAULT_TARGET_LANGUAGE;
  fields.customEli5Prompt.value = config.customEli5Prompt || "";
  fields.customTranslationPrompt.value = config.customTranslationPrompt || "";

  if ((config.geminiApiKey || "").trim()) {
    await loadGeminiModels();
  }
}

loadModelsButton.addEventListener("click", () => {
  void loadGeminiModels();
});

fields.geminiApiKey.addEventListener("change", () => {
  void loadGeminiModels();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Saving...");

  const targetLanguage = fields.targetLanguage.value.trim() || DEFAULT_TARGET_LANGUAGE;
  const geminiModel = fields.geminiModel.value || DEFAULT_GEMINI_MODEL;

  try {
    await storageSet({
      geminiApiKey: fields.geminiApiKey.value.trim(),
      geminiModel,
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
