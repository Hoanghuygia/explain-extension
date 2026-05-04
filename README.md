# Explain It

Explain It is a lightweight browser extension for explaining or translating selected text on any website with Gemini.

## Features

- Select text and press `Shift` for a short Vietnamese ELI5 explanation.
- Select text and press `Alt` for translation into your configured target language.
- Configure your Gemini API key locally in the extension options page.
- Customize the ELI5 and translation prompts with template variables.
- Firefox-first WebExtension with Chrome fallback support through Manifest V3.

## Configure Gemini

1. Get a Gemini API key from Google AI Studio: https://aistudio.google.com/api-keys.
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
5. Click `x` to close the popup.

Explain It does not trigger when there is no selected text or when you are typing in an input, textarea, select, or contenteditable area.

Selections are limited to 4000 characters to avoid unexpectedly large Gemini requests. If the Gemini API key is missing, the popup shows an error asking you to configure it in the options page.

## Packaging For Firefox Add-ons Later

For a future Firefox Add-ons submission:

1. Verify the extension works in a clean Firefox profile.
2. Confirm no API keys or secrets are included in the source.
3. Zip the extension files from the project root, excluding `.git` and development-only files.
4. Submit the zip through the Firefox Add-ons developer hub.

## ChatGPT Fallback

The first version implements Gemini only. ChatGPT fallback support can be added later by introducing provider settings in the options page and a provider-specific request function in `background.js`.
