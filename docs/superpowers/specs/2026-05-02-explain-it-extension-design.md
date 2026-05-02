# Explain It Browser Extension Design

## Summary

Explain It is a lightweight WebExtension that helps users understand selected text on any website. It targets Firefox first while keeping Chrome compatibility through Manifest V3 and a small `browser`/`chrome` API wrapper.

Users select text, then press:

- `Shift` to get a short Vietnamese ELI5 explanation.
- `Alt` to translate the selected text into the configured target language.

The first version implements Gemini API support end-to-end. ChatGPT support is intentionally left as a future fallback extension point to keep the initial version simple and reliable.

## Project Structure

The extension will use plain JavaScript, HTML, and CSS.

- `manifest.json`: Manifest V3 extension metadata, permissions, content script, cross-browser background declaration, options page, and Gemini host permission.
- `background.js`: Message handler, config loading, prompt selection, template replacement, Gemini API calls, and normalized errors.
- `content.js`: Selection detection, keyboard shortcut handling, popup lifecycle, page-safety checks, and communication with the background worker.
- `options.html`: Settings form for Gemini API key, target language, and custom prompts.
- `options.js`: Options page storage read/write logic.
- `styles.css`: Shared popup/options styling using the theme color `rgb(145, 238, 255)`.
- `README.md`: Local install, configuration, usage, and packaging instructions.
- `icons/`: Minimal extension icons if needed by the manifest.

## Browser Compatibility

The extension will use Manifest V3 because that was selected for Chrome-style compatibility. Firefox remains the primary target, so APIs will be limited to WebExtension-compatible behavior. The manifest will include both `background.scripts` and `background.service_worker`, following MDN's cross-browser MV3 pattern: Firefox uses the background script document, while Chrome uses the service worker.

A compatibility wrapper will choose `browser` when available and fall back to `chrome`:

```js
const ext = globalThis.browser || globalThis.chrome;
```

Promise wrappers will be added only where needed because Chrome callback APIs and Firefox promise APIs differ in some contexts.

## User Flow

1. User selects text on a web page.
2. User presses `Shift` or `Alt`.
3. `content.js` verifies the selection is non-empty, not inside an editable field, and within the max length.
4. A floating popup appears near the selected text with a loading state.
5. `content.js` sends a message to `background.js` with the selected text and requested action.
6. `background.js` loads config from extension storage.
7. `background.js` builds the final Gemini prompt from the custom prompt or default prompt.
8. `background.js` calls Gemini and returns the result or a friendly error.
9. The popup updates with the result or error and can be closed by the user.

## Popup UI

The popup will be created by the content script using Shadow DOM to avoid breaking or inheriting website styles. It will have unique class names as an additional safeguard.

The popup includes:

- Loading state while Gemini is responding.
- Result content when the request succeeds.
- Error state for missing API key, network/API failures, no selection, or selected text that is too long.
- Close button.
- Max height and scrolling for long Gemini responses.

Only one popup will exist at a time. New actions update or replace the existing popup instead of creating duplicates.

## Keyboard Handling

The content script listens for `keydown` events.

- `Shift` triggers ELI5 explanation.
- `Alt` triggers translation.

The listener will ignore events when:

- There is no selected text.
- The active element is an `input`, `textarea`, `select`, or contenteditable element.
- A request was triggered too recently by the same key.

A small debounce/throttle prevents repeated triggers from key repeat events.

## Selection Limits

Selected text will be trimmed before use. The max selected text length will be `4000` characters to avoid unexpectedly large API calls.

If selected text exceeds the limit, the popup will show a helpful error instead of calling Gemini.

## Options Page

The options page stores settings in `browser.storage.local` or `chrome.storage.local` through the compatibility wrapper.

Fields:

- Gemini API key.
- Target translation language, default `Vietnamese`.
- Custom ELI5 prompt textarea.
- Custom Translation prompt textarea.

The prompt textareas will include a hint explaining available variables:

- `{{text}}`: selected text.
- `{{targetLanguage}}`: configured target language.

Saved prompt values will be trimmed before storage so accidental leading/trailing whitespace does not affect behavior.

## Prompt Behavior

`background.js` owns prompt construction so the content script does not need to know API details.

For each request:

1. Load config from local storage.
2. Choose the prompt template:
   - Use custom prompt if it exists after trimming.
   - Otherwise use the built-in default prompt for the requested action.
3. Replace template variables:
   - `{{text}}` becomes the selected text.
   - `{{targetLanguage}}` becomes the configured target language.
4. Trim the final prompt.
5. If the final prompt is empty, return a helpful error and do not call Gemini.

Default ELI5 prompt:

```text
Explain the following text in Vietnamese like I am 5 years old.
Keep it simple, short, and easy to understand.
Text: "{{text}}"
```

Default Translation prompt:

```text
Translate the following text into {{targetLanguage}}.
Also include:
- Part of speech
- Short meaning
- One example sentence and its translation

Text: "{{text}}"
```

Custom prompts override the default behavior completely. If a custom prompt does not include `{{text}}`, the extension will still send it as written because the requirement allows full override behavior. Empty custom prompts fall back to defaults.

## Gemini Integration

The Gemini API key is never hard-coded. It is read from local extension storage at request time.

If the API key is missing, `background.js` returns a clear error asking the user to configure the key in extension options.

The Gemini request will use a current Gemini generate-content endpoint and send the final prompt as text content. API and network failures will be caught and converted into short, user-friendly popup messages.

## Error Handling

Errors are normalized in the background worker before being returned to the content script.

Handled cases:

- Missing API key.
- Empty selected text.
- Selected text too long.
- Empty final prompt.
- Network failure.
- Non-OK Gemini response.
- Gemini response without usable text.

The popup displays a concise error instead of failing silently.

## README Scope

The README will explain:

- Loading locally in Firefox through `about:debugging`.
- Loading locally in Chrome through `chrome://extensions` developer mode.
- Configuring the Gemini API key.
- Setting the target translation language.
- Customizing ELI5 and translation prompts with `{{text}}` and `{{targetLanguage}}`.
- Using `Shift` and `Alt` on selected text.
- Notes for later Firefox Add-ons packaging.
- ChatGPT fallback as a future extension point, not implemented in the initial version.

## Out of Scope For First Version

- Working ChatGPT fallback request logic.
- Provider selection UI.
- Streaming responses.
- Context menu actions.
- Persistent popup history.
- Multi-language extension UI.
