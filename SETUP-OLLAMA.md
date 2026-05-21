# Ollama Quick Start Guide

Run LLMs like Llama, Qwen, Gemma locally on your machine, 100% offline.

---

# 1. Install Ollama

## Windows / macOS

1. Go to: https://ollama.com/download
2. Download the installer for Windows/macOS
3. Install like a normal application
4. After installation, Ollama runs in the background

Test installation:

```bash
ollama --version
```

---

## Linux

Install:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Verify install:

```bash
ollama --version
```

---

# 2. Download a Model

General syntax:

```bash
ollama pull <model-name>
```

## Popular Models

| Use Case | Command | RAM Needed | Notes |
|---|---|---|---|
| Light, quick test | `ollama pull qwen2.5:1.5b` | ~2GB | Runs on weak PCs |
| Balanced | `ollama pull llama3.1:8b` | ~8GB | Good daily driver |
| Strong, smart | `ollama pull qwen2.5:32b` | ~24GB | Needs GPU / strong Mac |
| Coding | `ollama pull qwen2.5-coder:7b` | ~8GB | Specialized for coding |
| Vision | `ollama pull llava:7b` | ~8GB | Can read images |

See all models:

https://ollama.com/library

---

# 3. Run a Model to Chat

## Interactive Chat

```bash
ollama run llama3.1:8b
```

Type messages and press Enter to chat.

Exit:

```txt
/bye
```

---

## One-off Prompt

```bash
ollama run qwen2.5:1.5b "Explain AI to a 5th grader"
```

---

# 4. Useful Commands

| Command | Purpose |
|---|---|
| `ollama list` | Show downloaded models |
| `ollama ps` | Show running models |
| `ollama rm llama3.1:8b` | Delete a model |
| `ollama serve` | Start API server at `http://localhost:11434` |

---

# 5. Set OLLAMA_ORIGINS for Browser Extensions

Use this when browser extensions or web UIs need to call Ollama APIs.

Examples:
- Firefox extensions
- Chrome extensions
- Open WebUI
- Page Assist

---

## Linux (systemd)

Edit service override:

```bash
sudo systemctl edit ollama.service
```

Add:

```ini
[Service]
Environment="OLLAMA_ORIGINS=moz-extension://*,chrome-extension://*,*"
```

Reload + restart + check:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
systemctl show ollama | grep OLLAMA_ORIGINS
```

### Dev Mode

Allow all origins:

```ini
Environment="OLLAMA_ORIGINS=*"
```

### Production Recommendation

Prefer exact origins instead of `*`.

---

## macOS

If installed via app:

```bash
launchctl setenv OLLAMA_ORIGINS "moz-extension://*,chrome-extension://*,*"
```

Then quit and reopen the Ollama app.

---

If running manually:

```bash
OLLAMA_ORIGINS="moz-extension://*,*" ollama serve
```

---

## Windows

### Temporary (PowerShell)

```powershell
$env:OLLAMA_ORIGINS="moz-extension://*,chrome-extension://*,*"
ollama serve
```

---

### Permanent Environment Variable

1. Press `Win + R`
2. Type:

```txt
sysdm.cpl
```

3. Open:
   - Advanced
   - Environment Variables

4. Under **System Variables**:
   - New

5. Add:

```txt
Variable name:
OLLAMA_ORIGINS

Variable value:
moz-extension://*,chrome-extension://*,*
```

6. Restart Ollama or reboot PC

---

### Windows Service Mode

```powershell
sc stop Ollama

sc config Ollama binPath= "\"C:\Program Files\Ollama\ollama.exe\" serve"

reg add "HKLM\SYSTEM\CurrentControlSet\Services\Ollama" ^
  /v Environment ^
  /t REG_MULTI_SZ ^
  /d "OLLAMA_ORIGINS=moz-extension://*,chrome-extension://*,*" ^
  /f

sc start Ollama
```