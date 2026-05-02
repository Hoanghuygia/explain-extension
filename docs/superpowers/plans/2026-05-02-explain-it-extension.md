# Explain It Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Manifest V3 Firefox-first browser extension that explains or translates selected text with Gemini using configurable prompts.

**Architecture:** The content script owns page interaction and Shadow DOM popup UI. The background service worker owns settings lookup, prompt template resolution, and Gemini API calls so API behavior stays outside the page context. The options page owns persistent user configuration in extension local storage.

**Tech Stack:** Plain JavaScript, HTML, CSS, WebExtension Manifest V3, `browser.storage.local` / `chrome.storage.local`, Gemini generate-content REST API.

---

## File Structure

- Create `manifest.json`: MV3 manifest, content script registration, cross-browser background declaration, options page, storage permission, Gemini host permission, and extension icons.
- Create `background.js`: compatibility wrapper helpers, storage helpers, default prompts, prompt rendering, Gemini request logic, and message listener.
- Create `content.js`: selection extraction, editable-element guard, shortcut debounce, popup creation/update/close, Shadow DOM styling injection, and message sending.
- Create `options.html`: settings form for Gemini key, target language, custom ELI5 prompt, custom translation prompt, variable hints, and status area.
- Create `options.js`: options page compatibility wrapper, storage load/save, default language handling, textarea trimming, and save status.
- Create `styles.css`: options page styles plus popup CSS text reused by `content.js` via `fetch(ext.runtime.getURL('styles.css'))`.
- Create `README.md`: local install, configuration, usage, custom prompt variables, and packaging guidance.
- Create `icons/icon.svg`: lightweight SVG icon used by the manifest.

## Task 1: Extension Manifest And Icon

**Files:**
- Create: `manifest.json`
- Create: `icons/icon.svg`

- [ ] **Step 1: Create the MV3 manifest**

Write `manifest.json` with this content:

```json
{
  "manifest_version": 3,
  "name": "Explain It",
  "version": "0.1.0",
  "description": "Explain or translate selected text with Gemini.",
  "permissions": ["storage"],
  "host_permissions": ["https://generativelanguage.googleapis.com/*"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "options_ui": {
    "page": "options.html",
    "open_in_tab": true
  },
  "web_accessible_resources": [
    {
      "resources": ["styles.css"],
      "matches": ["<all_urls>"]
    }
  ],
  "icons": {
    "48": "icons/icon.svg",
    "96": "icons/icon.svg"
  }
}
```

- [ ] **Step 2: Create the icon**

Write `icons/icon.svg` with this content:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="Explain It icon">
  <rect width="128" height="128" rx="28" fill="rgb(145, 238, 255)"/>
  <path d="M30 36h68a12 12 0 0 1 12 12v32a12 12 0 0 1-12 12H62l-22 18v-18H30a12 12 0 0 1-12-12V48a12 12 0 0 1 12-12Z" fill="#102027" opacity="0.92"/>
  <path d="M42 56h44M42 72h30" stroke="#91eeff" stroke-width="8" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 3: Verify JSON syntax**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"`

Expected: `manifest ok`

## Task 2: Background Gemini And Prompt Engine

**Files:**
- Create: `background.js`

- [ ] **Step 1: Create the background worker**

Write `background.js` with this content:

```js
const ext = globalThis.browser || globalThis.chrome;

const DEFAULT_TARGET_LANGUAGE = "Vietnamese";
const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const DEFAULT_PROMPTS = {
  explain: `Explain the following text in Vietnamese like I am 5 years old.
Keep it simple, short, and easy to understand.
Text: "{{text}}"`,
  translate: `Translate the following text into {{targetLanguage}}.
Also include:
- Part of speech
- Short meaning
- One example sentence and its translation

Text: "{{text}}"`
};

function storageGet(defaults) {
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
    geminiApiKey: "",
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

async function callGemini(apiKey, prompt) {
  const response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
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
  const apiKey = (config.geminiApiKey || "").trim();

  if (!apiKey) {
    throw new Error("Missing Gemini API key. Open the Explain It options page to add one.");
  }

  const prompt = buildPrompt(action, config, text);
  const result = await callGemini(apiKey, prompt);

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
```

- [ ] **Step 2: Verify background syntax**

Run: `node --check background.js`

Expected: no syntax errors.

## Task 3: Content Script Popup And Shortcuts

**Files:**
- Create: `content.js`

- [ ] **Step 1: Create the content script**

Write `content.js` with this content:

```js
const explainItExt = globalThis.browser || globalThis.chrome;

const EXPLAIN_IT_MAX_SELECTION_LENGTH = 4000;
const EXPLAIN_IT_KEY_THROTTLE_MS = 800;

let explainItPopupHost = null;
let explainItPopupRoot = null;
let explainItLastTrigger = 0;

function isEditableElement(element) {
  if (!element) return false;
  const tagName = element.tagName?.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || element.isContentEditable;
}

function getSelectedText() {
  const selection = globalThis.getSelection();
  return (selection?.toString() || "").trim();
}

function getSelectionRect() {
  const selection = globalThis.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return null;
  }

  return rect;
}

function removePopup() {
  explainItPopupHost?.remove();
  explainItPopupHost = null;
  explainItPopupRoot = null;
}

async function loadStyles() {
  const url = explainItExt.runtime.getURL("styles.css");
  const response = await fetch(url);
  return response.text();
}

async function ensurePopup() {
  if (explainItPopupRoot) {
    return explainItPopupRoot;
  }

  explainItPopupHost = document.createElement("div");
  explainItPopupHost.id = "explain-it-popup-host";
  explainItPopupRoot = explainItPopupHost.attachShadow({ mode: "open" });

  const styles = document.createElement("style");
  styles.textContent = await loadStyles();

  const popup = document.createElement("section");
  popup.className = "explain-it-popup";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-live", "polite");
  popup.innerHTML = `
    <div class="explain-it-popup__header">
      <strong class="explain-it-popup__title">Explain It</strong>
      <button class="explain-it-popup__close" type="button" aria-label="Close Explain It popup">×</button>
    </div>
    <div class="explain-it-popup__body"></div>
  `;

  explainItPopupRoot.append(styles, popup);
  document.documentElement.appendChild(explainItPopupHost);
  explainItPopupRoot.querySelector(".explain-it-popup__close").addEventListener("click", removePopup);

  return explainItPopupRoot;
}

function positionPopup(rect) {
  if (!explainItPopupHost || !rect) return;

  const popupWidth = 340;
  const gap = 12;
  const left = Math.min(
    Math.max(rect.left + globalThis.scrollX, gap),
    globalThis.scrollX + document.documentElement.clientWidth - popupWidth - gap
  );
  const top = rect.bottom + globalThis.scrollY + gap;

  explainItPopupHost.style.position = "absolute";
  explainItPopupHost.style.left = `${left}px`;
  explainItPopupHost.style.top = `${top}px`;
  explainItPopupHost.style.zIndex = "2147483647";
}

async function showPopup(state, message, rect) {
  const root = await ensurePopup();
  positionPopup(rect || getSelectionRect());

  const body = root.querySelector(".explain-it-popup__body");
  body.className = `explain-it-popup__body explain-it-popup__body--${state}`;
  body.textContent = message;
}

function sendRuntimeMessage(payload) {
  return new Promise((resolve, reject) => {
    try {
      const response = explainItExt.runtime.sendMessage(payload, (result) => {
        const error = explainItExt.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(result);
      });

      if (response && typeof response.then === "function") {
        response.then(resolve, reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}

async function runAction(action) {
  const now = Date.now();
  if (now - explainItLastTrigger < EXPLAIN_IT_KEY_THROTTLE_MS) {
    return;
  }
  explainItLastTrigger = now;

  if (isEditableElement(document.activeElement)) {
    return;
  }

  const text = getSelectedText();
  if (!text) {
    return;
  }

  const rect = getSelectionRect();

  if (text.length > EXPLAIN_IT_MAX_SELECTION_LENGTH) {
    await showPopup("error", `Selected text is too long. Please select ${EXPLAIN_IT_MAX_SELECTION_LENGTH} characters or fewer.`, rect);
    return;
  }

  await showPopup("loading", action === "explain" ? "Explaining selected text..." : "Translating selected text...", rect);

  try {
    const response = await sendRuntimeMessage({
      type: "EXPLAIN_IT_RUN",
      action,
      text
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Explain It failed. Please try again.");
    }

    await showPopup("result", response.result, rect);
  } catch (error) {
    await showPopup("error", error.message || "Explain It failed. Please try again.", rect);
  }
}

document.addEventListener("keydown", (event) => {
  if (event.repeat) {
    return;
  }

  if (event.key === "Shift") {
    void runAction("explain");
  }

  if (event.key === "Alt") {
    void runAction("translate");
  }
});
```

- [ ] **Step 2: Verify content script syntax**

Run: `node --check content.js`

Expected: no syntax errors.

## Task 4: Options Page And Storage

**Files:**
- Create: `options.html`
- Create: `options.js`

- [ ] **Step 1: Create the options page HTML**

Write `options.html` with this content:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Explain It Options</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body class="explain-it-options-page">
    <main class="explain-it-options">
      <section class="explain-it-options__hero">
        <p class="explain-it-options__eyebrow">Explain It</p>
        <h1>Extension Options</h1>
        <p>Configure Gemini and customize how selected text is explained or translated.</p>
      </section>

      <form id="explain-it-options-form" class="explain-it-options__form">
        <label class="explain-it-field">
          <span>Gemini API key</span>
          <input id="geminiApiKey" type="password" autocomplete="off" placeholder="Paste your Gemini API key" />
        </label>

        <label class="explain-it-field">
          <span>Target translation language</span>
          <input id="targetLanguage" type="text" placeholder="Vietnamese" />
        </label>

        <label class="explain-it-field">
          <span>Custom ELI5 prompt</span>
          <textarea id="customEli5Prompt" rows="7" placeholder="Leave empty to use the default ELI5 prompt"></textarea>
        </label>

        <label class="explain-it-field">
          <span>Custom Translation prompt</span>
          <textarea id="customTranslationPrompt" rows="8" placeholder="Leave empty to use the default translation prompt"></textarea>
        </label>

        <aside class="explain-it-options__hint">
          <strong>You can use:</strong>
          <code>{{text}}</code> for selected text and <code>{{targetLanguage}}</code> for the configured language.
        </aside>

        <div class="explain-it-options__actions">
          <button type="submit">Save Options</button>
          <p id="status" role="status" aria-live="polite"></p>
        </div>
      </form>
    </main>
    <script src="options.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create the options JavaScript**

Write `options.js` with this content:

```js
const optionsExt = globalThis.browser || globalThis.chrome;
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
```

- [ ] **Step 3: Verify options script syntax**

Run: `node --check options.js`

Expected: no syntax errors.

## Task 5: Styles

**Files:**
- Create: `styles.css`

- [ ] **Step 1: Create shared CSS**

Write `styles.css` with this content:

```css
:host {
  all: initial;
  color-scheme: light;
}

.explain-it-popup {
  width: min(340px, calc(100vw - 24px));
  max-height: 420px;
  overflow: hidden;
  border: 1px solid rgba(16, 32, 39, 0.16);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 50px rgba(16, 32, 39, 0.24);
  color: #102027;
  font: 14px/1.55 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  animation: explain-it-pop 180ms ease-out;
  backdrop-filter: blur(18px);
}

.explain-it-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: linear-gradient(135deg, rgb(145, 238, 255), #eefcff);
}

.explain-it-popup__title {
  font-size: 13px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.explain-it-popup__close {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 999px;
  background: rgba(16, 32, 39, 0.1);
  color: #102027;
  cursor: pointer;
  font: 20px/1 Arial, sans-serif;
  transition: transform 150ms ease, background 150ms ease;
}

.explain-it-popup__close:hover {
  transform: rotate(90deg) scale(1.04);
  background: rgba(16, 32, 39, 0.18);
}

.explain-it-popup__body {
  max-height: 330px;
  overflow: auto;
  padding: 14px;
  white-space: pre-wrap;
}

.explain-it-popup__body--loading::before {
  content: "";
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 8px;
  border: 2px solid rgba(16, 32, 39, 0.2);
  border-top-color: #102027;
  border-radius: 999px;
  animation: explain-it-spin 700ms linear infinite;
  vertical-align: -1px;
}

.explain-it-popup__body--error {
  color: #8a1f11;
}

.explain-it-options-page {
  min-height: 100vh;
  margin: 0;
  background: radial-gradient(circle at top left, rgba(145, 238, 255, 0.42), transparent 34%), #f7fbfc;
  color: #102027;
  font: 16px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.explain-it-options {
  width: min(880px, calc(100% - 32px));
  margin: 0 auto;
  padding: 48px 0;
}

.explain-it-options__hero {
  margin-bottom: 24px;
}

.explain-it-options__eyebrow {
  margin: 0 0 8px;
  color: #15788a;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.explain-it-options h1 {
  margin: 0 0 8px;
  font-size: clamp(32px, 6vw, 56px);
  line-height: 1;
}

.explain-it-options__hero p:last-child {
  max-width: 620px;
  margin: 0;
  color: #4a6269;
}

.explain-it-options__form {
  display: grid;
  gap: 18px;
  padding: 24px;
  border: 1px solid rgba(16, 32, 39, 0.08);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 20px 60px rgba(16, 32, 39, 0.08);
}

.explain-it-field {
  display: grid;
  gap: 8px;
  font-weight: 700;
}

.explain-it-field input,
.explain-it-field textarea {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid rgba(16, 32, 39, 0.16);
  border-radius: 14px;
  background: #fff;
  color: #102027;
  font: inherit;
  font-weight: 400;
  padding: 12px 14px;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.explain-it-field textarea {
  resize: vertical;
}

.explain-it-field input:focus,
.explain-it-field textarea:focus {
  border-color: #16a7bd;
  box-shadow: 0 0 0 4px rgba(145, 238, 255, 0.36);
  outline: none;
}

.explain-it-options__hint {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(145, 238, 255, 0.24);
  color: #24484f;
}

.explain-it-options__hint code {
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.86);
  padding: 2px 6px;
}

.explain-it-options__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.explain-it-options__actions button {
  border: 0;
  border-radius: 999px;
  background: #102027;
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-weight: 800;
  padding: 12px 18px;
  transition: transform 150ms ease, box-shadow 150ms ease;
}

.explain-it-options__actions button:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(16, 32, 39, 0.18);
}

#status {
  min-height: 24px;
  margin: 0;
  color: #157338;
  font-weight: 700;
}

#status[data-type="error"] {
  color: #8a1f11;
}

@keyframes explain-it-pop {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes explain-it-spin {
  to {
    transform: rotate(360deg);
  }
}
```

## Task 6: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README documentation**

Write `README.md` with this content:

```md
# Explain It

Explain It is a lightweight browser extension for explaining or translating selected text on any website with Gemini.

## Features

- Select text and press `Shift` for a short Vietnamese ELI5 explanation.
- Select text and press `Alt` for translation into your configured target language.
- Configure your Gemini API key locally in the extension options page.
- Customize the ELI5 and translation prompts with template variables.
- Firefox-first WebExtension with Chrome fallback support through Manifest V3.

## Configure Gemini

1. Get a Gemini API key from Google AI Studio.
2. Open the Explain It options page.
3. Paste the key into `Gemini API key`.
4. Set `Target translation language`, or keep the default `Vietnamese`.
5. Optionally customize the prompt textareas.
6. Click `Save Options`.

The API key is stored in extension local storage. It is not hard-coded in the source.

## Custom Prompts

The options page supports two optional prompt templates:

- Custom ELI5 prompt for `Shift`.
- Custom Translation prompt for `Alt`.

Available variables:

- `{{text}}`: the selected text.
- `{{targetLanguage}}`: the configured target language.

If a custom prompt is empty, Explain It uses the built-in default prompt. If a custom prompt exists, it fully replaces the default behavior.

## Install Locally On Firefox

1. Open Firefox.
2. Go to `about:debugging`.
3. Click `This Firefox`.
4. Click `Load Temporary Add-on...`.
5. Select this project's `manifest.json` file.
6. Open the extension options page and configure your Gemini API key.

Temporary add-ons are removed when Firefox restarts.

## Install Locally On Chrome

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select this project folder.
6. Open the extension options page and configure your Gemini API key.

## Usage

1. Highlight text on any webpage.
2. Press `Shift` to explain the text simply in Vietnamese.
3. Press `Alt` to translate the text into the configured target language.
4. Read the result in the floating popup near the selected text.
5. Click `×` to close the popup.

Explain It does not trigger when there is no selected text or when you are typing in an input, textarea, select, or contenteditable area.

## Packaging For Firefox Add-ons Later

For a future Firefox Add-ons submission:

1. Verify the extension works in a clean Firefox profile.
2. Confirm no API keys or secrets are included in the source.
3. Zip the extension files from the project root, excluding `.git` and development-only files.
4. Submit the zip through the Firefox Add-ons developer hub.

## ChatGPT Fallback

The first version implements Gemini only. ChatGPT fallback support can be added later by introducing provider settings in the options page and a provider-specific request function in `background.js`.
```

## Task 7: Verification

**Files:**
- Verify: `manifest.json`
- Verify: `background.js`
- Verify: `content.js`
- Verify: `options.js`
- Verify: `README.md`

- [ ] **Step 1: Run syntax checks**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')" && node --check background.js && node --check content.js && node --check options.js`

Expected: `manifest ok` and no JavaScript syntax errors.

- [ ] **Step 2: Inspect working tree**

Run: `git status --short --branch`

Expected: branch is `develop` and the created extension files are listed as untracked or modified.

- [ ] **Step 3: Manual browser smoke test**

Firefox expected result:

1. Load `manifest.json` from `about:debugging`.
2. Open options, save a Gemini API key, and keep language as `Vietnamese`.
3. Select text on a non-extension webpage and press `Shift`.
4. Popup appears near the selection, shows loading, then shows a short Vietnamese explanation.
5. Select text and press `Alt`.
6. Popup shows a translation response based on the configured translation prompt.
7. Focus an input or textarea, select text inside it, and press `Shift`; no popup appears.

Chrome expected result:

1. Load the project folder from `chrome://extensions` with developer mode enabled.
2. Repeat the options save and selected-text shortcut checks.

## Self-Review Notes

- Spec coverage: manifest, background Gemini integration, content popup, options storage, custom prompts, template variables, README, browser compatibility, and edge cases are covered by Tasks 1 through 7.
- Placeholder scan: no placeholder tasks are intentionally left for implementation.
- Consistency check: storage keys are `geminiApiKey`, `targetLanguage`, `customEli5Prompt`, and `customTranslationPrompt` across background and options code.
