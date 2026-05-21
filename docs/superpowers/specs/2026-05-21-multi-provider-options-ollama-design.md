## Overview
- Add multi-provider support (Gemini + Ollama Local) to options UI and runtime.
- Keep the existing Gemini behavior unchanged; add Ollama as a parallel provider.
- Provide a clean separation between provider-specific logic with a shared wrapper.

## Goals
- Options page supports selecting provider, model, API key, and Ollama base URL.
- Runtime requests route to the selected provider immediately.
- Ollama model list loads dynamically from localhost.
- Clear status and warnings when Ollama is unavailable.
- Maintain existing UX, colors, spacing, and layout.

## Non-goals
- Adding new providers beyond Gemini and Ollama.
- Refactoring unrelated UI or runtime logic.
- Changing existing content or popup UX beyond provider-aware status.

## User Experience
- Provider dropdown appears at the top of the options form.
- API key field shows only when the selected provider requires it.
- Model dropdown label is changed to "Model" and loads options per provider.
- Ollama base URL input appears when provider is Ollama; defaults to http://localhost:11434.
- When Ollama is not reachable:
  - "Ollama (Local)" remains visible but disabled.
  - A clear warning is shown in the model status area.

## Data Model (Storage)
- provider: "gemini" | "ollama"
- geminiApiKey: string
- geminiModel: string
- ollamaBaseUrl: string (default http://localhost:11434)
- ollamaModel: string (default llama3.2:3b)
- targetLanguage, customEli5Prompt, customTranslationPrompt: unchanged

## Options Page Architecture
- Provider helpers in options.js:
  - getSelectedProvider()
  - providerRequiresApiKey(provider)
  - getModelsForProvider(provider)
  - loadModelsForProvider(provider)
  - testProviderModel(provider, model)
- Provider-specific model loading:
  - Gemini: use existing Gemini model API logic.
  - Ollama: GET {baseUrl}/api/tags and map response.models[].name.
- Load Models button triggers provider-aware loading and testing.

## Runtime Architecture (Background)
- Provider-specific request functions:
  - callGemini(apiKey, model, prompt): existing behavior unchanged.
  - callOllama(baseUrl, model, prompt): POST {baseUrl}/api/chat with stream:false.
- Shared wrapper:
  - callProvider(provider, config, prompt) routes to Gemini or Ollama.
- Prompt construction remains shared and unchanged.

## Popup Behavior
- API status reflects provider:
  - Gemini: Connected/Missing based on API key.
  - Ollama: Connected (no API key required).

## Error Handling
- Missing Gemini key: unchanged error message.
- Ollama unreachable: show warning in options model status, disable Ollama option.
- Ollama request failure: surface response error message when available.

## Manifest Changes
- Add host permissions for:
  - http://localhost:11434/*
  - http://127.0.0.1:11434/*

## Testing Plan
- Open options page and verify provider dropdown appears.
- Switch to Gemini: API key input visible; Gemini models load as before.
- Switch to Ollama: API key hidden; base URL input visible; models load via /api/tags.
- Click Load Models: model status shows success or clear error.
- Save options and reload page: provider/model/base URL persist.
- Trigger explain/translate with provider set to:
  - Gemini: behavior unchanged.
  - Ollama: request sent to local /api/chat and response displayed.
