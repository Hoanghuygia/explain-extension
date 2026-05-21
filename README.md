# Explain It

Explain It is a lightweight browser extension for explaining or translating selected text on any website using Gemini or a local Ollama model.

## Features

- Select text and press `Shift` for a short Vietnamese ELI5 explanation.
- Select text and press `Alt` for translation into your configured target language.
- Supports both **Gemini** (cloud API key) and **Ollama** (local model) providers.
- Configure your provider and API key locally in the extension options page.
- Load available models for the selected provider with one click.
- Customize the ELI5 and translation prompts with template variables.
- Firefox-first WebExtension with Chrome fallback support through Manifest V3.

## Configuration

1. Open the Explain It options page.
2. Choose your provider: **Gemini** or **Ollama (Local)**.
3. Fill in the fields for your chosen provider:
   - **Gemini**: paste your API key from Google AI Studio, then click "Load Models".
   - **Ollama**: set the base URL (defaults to `http://localhost:11434`), then click "Load Models".
4. Select a model from the loaded list.
5. Set the target translation language, or keep the default `Vietnamese`.
6. Optionally customize the prompt textareas.
7. Click `Save Options`.

Secrets (API keys) are stored in extension local storage, not hard-coded in the source.

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
6. Open the extension options page and configure your provider (Gemini or Ollama).

Temporary add-ons are removed when Firefox restarts.

## Install Locally On Chrome

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select this project folder.
6. Open the extension options page and configure your provider (Gemini or Ollama).

## Usage

1. Highlight text on any webpage.
2. Press `Shift` to explain the text simply in Vietnamese.
3. Press `Alt` to translate the text into the configured target language.
4. Read the result in the floating popup near the selected text.
5. Click `x` to close the popup.

Explain It does not trigger when there is no selected text or when you are typing in an input, textarea, select, or contenteditable area.

Selections are limited to 4000 characters to avoid unexpectedly large requests. If the provider is not configured, the popup shows an error asking you to configure it in the options page.

## Packaging For Firefox Add-ons Later

For a future Firefox Add-ons submission:

1. Verify the extension works in a clean Firefox profile.
2. Confirm no API keys or secrets are included in the source.
3. Zip the extension files from the project root, excluding `.git` and development-only files.
4. Submit the zip through the Firefox Add-ons developer hub.


