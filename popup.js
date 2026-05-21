const popupExt = globalThis.browser || globalThis.chrome;
const popupUsesPromiseApi = typeof globalThis.browser !== "undefined";

const apiStatus = document.querySelector("#apiStatus");
const setupButton = document.querySelector("#setupButton");
const settingsButton = document.querySelector("#settingsButton");
const enabledToggle = document.querySelector("#enabledToggle");
const toggleState = document.querySelector("#toggleState");
const version = document.querySelector("#version");

function storageGet(defaults) {
  if (popupUsesPromiseApi) {
    return popupExt.storage.local.get(defaults);
  }

  return new Promise((resolve, reject) => {
    try {
      popupExt.storage.local.get(defaults, (items) => {
        const error = popupExt.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(items || defaults);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function storageSet(values) {
  if (popupUsesPromiseApi) {
    return popupExt.storage.local.set(values);
  }

  return new Promise((resolve, reject) => {
    try {
      popupExt.storage.local.set(values, () => {
        const error = popupExt.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

function openExtensionOptions() {
  if (popupExt.runtime.openOptionsPage) {
    const result = popupExt.runtime.openOptionsPage();
    if (result && typeof result.then === "function") {
      return result;
    }
    return Promise.resolve();
  }

  const optionsUrl = popupExt.runtime.getURL("options.html");
  if (popupUsesPromiseApi) {
    return popupExt.tabs.create({ url: optionsUrl });
  }

  return new Promise((resolve, reject) => {
    popupExt.tabs.create({ url: optionsUrl }, () => {
      const error = popupExt.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function setApiStatus(hasApiKey) {
  apiStatus.textContent = hasApiKey ? "Connected" : "Missing";
  apiStatus.classList.toggle("explain-it-status--missing", !hasApiKey);
  setupButton.hidden = hasApiKey;
}

function setToggleState(enabled) {
  enabledToggle.checked = enabled;
  toggleState.textContent = enabled ? "Turned on" : "Turned off";
}

async function loadPopupState() {
  const config = await storageGet({
    provider: "gemini",
    geminiApiKey: "",
    enabled: true
  });

  const provider = config.provider || "gemini";
  if (provider === "ollama") {
    setApiStatus(true);
  } else {
    setApiStatus(Boolean((config.geminiApiKey || "").trim()));
  }

  setToggleState(config.enabled !== false);
}

enabledToggle.addEventListener("change", async () => {
  const enabled = enabledToggle.checked;
  setToggleState(enabled);
  await storageSet({ enabled });
});

setupButton.addEventListener("click", () => {
  void openExtensionOptions();
});

settingsButton.addEventListener("click", () => {
  void openExtensionOptions();
});

version.textContent = popupExt.runtime.getManifest().version;

loadPopupState().catch(() => {
  apiStatus.textContent = "Unavailable";
  apiStatus.classList.add("explain-it-status--missing");
});
