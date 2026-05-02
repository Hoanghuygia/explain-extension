const explainItExt = globalThis.browser || globalThis.chrome;
const explainItUsesPromiseApi = typeof globalThis.browser !== "undefined";

const EXPLAIN_IT_MAX_SELECTION_LENGTH = 4000;
const EXPLAIN_IT_KEY_THROTTLE_MS = 800;

let explainItPopupHost = null;
let explainItPopupRoot = null;
let explainItLastTrigger = 0;
let explainItRequestInFlight = false;

function isEditableElement(element) {
  if (!element) return false;
  const tagName = element.tagName?.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || element.isContentEditable;
}

function nodeHasEditableAncestor(node) {
  let current = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;

  while (current) {
    if (isEditableElement(current)) {
      return true;
    }
    current = current.parentElement || current.host;
  }

  return false;
}

function eventStartedInEditable(event) {
  return event.composedPath().some((item) => item instanceof Element && isEditableElement(item));
}

function selectionTouchesEditable() {
  const selection = globalThis.getSelection();
  return nodeHasEditableAncestor(selection?.anchorNode) || nodeHasEditableAncestor(selection?.focusNode);
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
      <button class="explain-it-popup__close" type="button" aria-label="Close Explain It popup">x</button>
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
  const spaceBelow = document.documentElement.clientHeight - rect.bottom;
  const estimatedHeight = 360;
  const belowTop = rect.bottom + globalThis.scrollY + gap;
  const aboveTop = rect.top + globalThis.scrollY - estimatedHeight - gap;
  const top = spaceBelow >= 180 ? belowTop : Math.max(globalThis.scrollY + gap, aboveTop);

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
  if (explainItUsesPromiseApi) {
    return explainItExt.runtime.sendMessage(payload);
  }

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

async function runAction(action, event) {
  const now = Date.now();
  if (now - explainItLastTrigger < EXPLAIN_IT_KEY_THROTTLE_MS) {
    return;
  }
  explainItLastTrigger = now;

  if (explainItRequestInFlight) {
    return;
  }

  if (eventStartedInEditable(event) || isEditableElement(document.activeElement) || selectionTouchesEditable()) {
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
  explainItRequestInFlight = true;

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
  } finally {
    explainItRequestInFlight = false;
  }
}

document.addEventListener("keydown", (event) => {
  if (event.repeat) {
    return;
  }

  if (event.key === "Shift") {
    void runAction("explain", event);
  }

  if (event.key === "Alt") {
    void runAction("translate", event);
  }
});
