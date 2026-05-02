const optionsExt = globalThis.browser || globalThis.chrome;
const optionsUsesPromiseApi = typeof globalThis.browser !== "undefined";
const DEFAULT_TARGET_LANGUAGE = "Vietnamese";

const form = document.querySelector("#explain-it-options-form");
const status = document.querySelector("#status");

const fields = {
  geminiApiKey: document.querySelector("#geminiApiKey"),
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

async function loadOptions() {
  const config = await storageGet({
    geminiApiKey: "",
    targetLanguage: DEFAULT_TARGET_LANGUAGE,
    customEli5Prompt: "",
    customTranslationPrompt: ""
  });

  fields.geminiApiKey.value = config.geminiApiKey || "";
  fields.targetLanguage.value = config.targetLanguage || DEFAULT_TARGET_LANGUAGE;
  fields.customEli5Prompt.value = config.customEli5Prompt || "";
  fields.customTranslationPrompt.value = config.customTranslationPrompt || "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Saving...");

  const targetLanguage = fields.targetLanguage.value.trim() || DEFAULT_TARGET_LANGUAGE;

  try {
    await storageSet({
      geminiApiKey: fields.geminiApiKey.value.trim(),
      targetLanguage,
      customEli5Prompt: fields.customEli5Prompt.value.trim(),
      customTranslationPrompt: fields.customTranslationPrompt.value.trim()
    });

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
