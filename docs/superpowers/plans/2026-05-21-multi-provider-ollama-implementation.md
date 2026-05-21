# Multi-Provider (Gemini + Ollama) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add provider selection with Ollama support in options and runtime while preserving existing Gemini behavior.

**Architecture:** Introduce small provider-specific modules in options/background with shared wrappers for model loading/testing and runtime requests. Keep Gemini paths intact, add Ollama paths alongside.

**Tech Stack:** Browser extension (MV3), vanilla JS, HTML/CSS.

---

## File Structure

- Modify: `options.html` — add provider dropdown, model label, Ollama base URL field.
- Modify: `options.js` — provider helpers, storage defaults, model loading/testing for Gemini and Ollama.
- Modify: `styles.css` — small visibility helper for conditional fields.
- Modify: `background.js` — provider routing for Gemini/Ollama requests.
- Modify: `popup.js` — provider-aware status display.
- Modify: `manifest.json` — add localhost host permissions.

---

### Task 1: Update options UI fields

**Files:**
- Modify: `options.html`

- [ ] **Step 1: Update options form markup**

Replace the top of the form with provider + base URL fields and rename the model label:

```html
<label class="explain-it-field">
  <span>Provider</span>
  <select id="provider">
    <option value="gemini">Gemini</option>
    <option value="ollama">Ollama (Local)</option>
  </select>
</label>

<label class="explain-it-field" id="ollamaBaseUrlField">
  <span>Ollama base URL</span>
  <input id="ollamaBaseUrl" type="url" placeholder="http://localhost:11434" />
</label>

<label class="explain-it-field" id="geminiApiKeyField">
  <span class="explain-it-field__label">
    <span>Gemini API key</span>
    <a
      class="explain-it-field__help-link"
      href="https://aistudio.google.com/api-keys"
      target="_blank"
      rel="noopener noreferrer"
    >Get API key</a>
  </span>
  <input id="geminiApiKey" type="password" autocomplete="off" placeholder="Paste your Gemini API key" />
</label>

<label class="explain-it-field">
  <span>Model</span>
  <select id="geminiModel">
    <option value="">Enter an API key to load supported models</option>
  </select>
</label>
```

- [ ] **Step 2: Ensure model label is "Model"**

Verify the label text above reads exactly "Model".

- [ ] **Step 3: Commit**

```bash
git add options.html
git commit -m "feat: add provider fields to options"
```

---

### Task 2: Add CSS visibility helper for conditional fields

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Add helper class**

Add near other options styles:

```css
.explain-it-field.is-hidden {
  display: none;
}
```

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "style: add hidden field helper"
```

---

### Task 3: Provider-aware options logic

**Files:**
- Modify: `options.js`

- [ ] **Step 1: Add defaults and fields**

Add constants and fields near top:

```js
const DEFAULT_PROVIDER = "gemini";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "llama3.2:3b";
const OLLAMA_TAGS_PATH = "/api/tags";
const OLLAMA_CHAT_PATH = "/api/chat";
```

Extend `fields`:

```js
provider: document.querySelector("#provider"),
ollamaBaseUrl: document.querySelector("#ollamaBaseUrl"),
ollamaBaseUrlField: document.querySelector("#ollamaBaseUrlField"),
geminiApiKeyField: document.querySelector("#geminiApiKeyField"),
```

- [ ] **Step 2: Add provider helper functions**

Add helpers below `setModelStatus`:

```js
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
```

- [ ] **Step 3: Add Ollama model loading + testing**

Add helper functions:

```js
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
```

- [ ] **Step 4: Create provider-aware model loading**

Refactor Gemini loading into provider functions and add Ollama:

```js
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
```

- [ ] **Step 5: Add provider test function**

```js
async function testProviderModel(provider, model) {
  if (provider === "gemini") {
    await loadGeminiModels();
    return;
  }

  const baseUrl = (fields.ollamaBaseUrl.value || DEFAULT_OLLAMA_BASE_URL).trim();
  await testOllamaModel(baseUrl, model);
}
```

- [ ] **Step 6: Update loadOptions defaults and apply UI state**

Update `loadOptions` defaults and set fields:

```js
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
fields.ollamaBaseUrl.value = config.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL;
```

Add UI toggling:

```js
function applyProviderUI(provider) {
  const needsKey = providerRequiresApiKey(provider);
  fields.geminiApiKeyField.classList.toggle("is-hidden", !needsKey);
  fields.ollamaBaseUrlField.classList.toggle("is-hidden", provider !== "ollama");
}
```

- [ ] **Step 7: Add provider listeners**

```js
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
```

- [ ] **Step 8: Update save handler**

Save provider and models:

```js
const provider = getSelectedProvider();
const geminiModel = fields.geminiModel.value || DEFAULT_GEMINI_MODEL;
const ollamaModel = fields.geminiModel.value || DEFAULT_OLLAMA_MODEL;

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
```

- [ ] **Step 9: Commit**

```bash
git add options.js
git commit -m "feat: add provider-aware options logic"
```

---

### Task 4: Add provider routing in background runtime

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Add provider defaults**

Add at top:

```js
const DEFAULT_PROVIDER = "gemini";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "llama3.2:3b";
```

- [ ] **Step 2: Add Ollama call**

Add functions:

```js
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
```

- [ ] **Step 3: Update loadConfig defaults**

```js
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
```

- [ ] **Step 4: Route handleAction through provider**

Replace Gemini-only block with:

```js
const config = await loadConfig();
const provider = config.provider || DEFAULT_PROVIDER;
const prompt = buildPrompt(action, config, text);
const result = await callProvider(provider, config, prompt);
return { ok: true, result };
```

- [ ] **Step 5: Commit**

```bash
git add background.js
git commit -m "feat: route runtime requests by provider"
```

---

### Task 5: Update popup status for provider

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: Load provider config**

Update defaults:

```js
const config = await storageGet({
  provider: "gemini",
  geminiApiKey: "",
  enabled: true
});
```

- [ ] **Step 2: Provider-aware API status**

```js
const provider = config.provider || "gemini";
if (provider === "ollama") {
  setApiStatus(true);
} else {
  setApiStatus(Boolean((config.geminiApiKey || "").trim()));
}
```

- [ ] **Step 3: Commit**

```bash
git add popup.js
git commit -m "feat: reflect provider status in popup"
```

---

### Task 6: Add Ollama host permissions

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Add host permissions**

```json
"host_permissions": [
  "https://generativelanguage.googleapis.com/*",
  "http://localhost:11434/*",
  "http://127.0.0.1:11434/*"
],
```

- [ ] **Step 2: Commit**

```bash
git add manifest.json
git commit -m "feat: allow local Ollama host permissions"
```

---

## Self-Review

**Spec coverage check:**
- Provider dropdown + API key visibility + base URL field: Task 1, Task 3.
- Model dropdown provider-specific options + warnings: Task 3.
- Runtime provider routing: Task 4.
- Popup provider status: Task 5.
- Manifest host permissions: Task 6.

**Placeholder scan:** No placeholders or TBDs.

**Type consistency:** Provider keys are "gemini" and "ollama" across options/background/popup.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-21-multi-provider-ollama-implementation.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
