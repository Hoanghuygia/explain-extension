# Popup Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an extension action popup that shows API key status, enables/disables shortcuts, links to options, shows shortcut guidance, and displays the add-on version.

**Architecture:** `popup.html` provides the action popup structure, `popup.css` owns popup-specific styling, and `popup.js` owns storage reads/writes plus opening the options page without hard-coded extension URLs. `content.js` reads an `enabled` storage setting before running keyboard actions.

**Tech Stack:** Plain JavaScript, HTML, CSS, WebExtension MV3 APIs, `browser.storage.local` / `chrome.storage.local` compatibility.

---

## File Structure

- Create `popup.html`: header, API key status card, setup/settings buttons, quick on/off toggle, shortcut guide, and version footer.
- Create `popup.css`: compact action-popup UI using `rgb(145, 238, 255)` as the main color.
- Create `popup.js`: storage wrapper, API key status detection, enabled toggle persistence, options navigation, and version display.
- Modify `manifest.json`: keep `action.default_popup` set to `popup.html`; no hard-coded extension URL.
- Modify `content.js`: check `enabled` from storage before running `Shift`/`Alt` actions.

## Task 1: Popup Markup And Style

**Files:**
- Create: `popup.html`
- Create: `popup.css`

- [ ] **Step 1: Create `popup.html`**

Create a popup with these elements: header, status label, `Setup Now`, toggle checkbox, shortcut guide, `Settings`, and version text. Include `popup.css` and `popup.js`.

- [ ] **Step 2: Create `popup.css`**

Style the popup at about 320px wide, use `rgb(145, 238, 255)` as the primary accent, add clean cards/buttons, and keep it lightweight.

## Task 2: Popup Behavior

**Files:**
- Create: `popup.js`

- [ ] **Step 1: Implement storage compatibility**

Use `browser` promise APIs when available and `chrome` callback APIs otherwise for `storage.local.get` and `storage.local.set`.

- [ ] **Step 2: Implement options navigation**

Use `runtime.openOptionsPage()` when available. If unavailable, open `runtime.getURL("options.html")` with `tabs.create`. Do not hard-code `moz-extension://...`.

- [ ] **Step 3: Implement status and toggle**

Read `geminiApiKey` and `enabled` from storage. Show connected/missing status, default `enabled` to `true`, and save toggle changes to storage.

- [ ] **Step 4: Display version**

Read `runtime.getManifest().version` and display it at the bottom.

## Task 3: Content Toggle Integration

**Files:**
- Modify: `content.js`

- [ ] **Step 1: Add storage helper**

Add a content-script storage helper compatible with Firefox promises and Chrome callbacks.

- [ ] **Step 2: Block actions when disabled**

At the beginning of `runAction`, load `{ enabled: true }`; if `enabled === false`, return before showing a popup or calling Gemini.

## Task 4: Verification

**Files:**
- Verify: `manifest.json`
- Verify: `popup.js`
- Verify: `content.js`
- Verify: `background.js`
- Verify: `options.js`

- [ ] **Step 1: Run syntax verification**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')" && node --check background.js && node --check content.js && node --check options.js && node --check popup.js`

Expected: `manifest ok` and no JavaScript syntax errors.

- [ ] **Step 2: Inspect status**

Run: `git status --short --branch`

Expected: branch `develop`, with popup files and content changes visible.

## Self-Review Notes

- Requirements covered: header, API key status, setup/settings navigation, quick toggle, shortcut guide, version footer, non-hard-coded options URL, and main color are covered.
- Storage keys: `geminiApiKey` existing key is reused; new `enabled` key defaults to `true`.
- No hard-coded extension UUID is used.
