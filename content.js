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

function nodeHasEditableAncestor(node) { // Prevent user edit text and mistakely trigger the extension 
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

  const header = document.createElement("div");
  header.className = "explain-it-popup__header";

  const title = document.createElement("strong");
  title.className = "explain-it-popup__title";
  title.textContent = "Explain It";

  const closeButton = document.createElement("button");
  closeButton.className = "explain-it-popup__close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close Explain It popup");
  closeButton.textContent = "x";

  const body = document.createElement("div");
  body.className = "explain-it-popup__body";

  header.append(title, closeButton);
  popup.append(header, body);

  explainItPopupRoot.append(styles, popup);
  document.documentElement.appendChild(explainItPopupHost);
  closeButton.addEventListener("click", removePopup);

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
  body.textContent = "";

  if (state === "result") {
    renderMarkdown(body, message);
    return;
  }

  body.textContent = message;
}

function renderMarkdown(container, markdown) {
  if (!globalThis.marked?.lexer) {
    container.textContent = markdown;
    return;
  }

  const fragment = document.createDocumentFragment();
  const tokens = globalThis.marked.lexer(markdown || "", { breaks: true, gfm: true });
  appendBlockTokens(fragment, tokens);
  container.append(fragment);
}

function appendBlockTokens(parent, tokens) {
  tokens.forEach((token) => {
    const element = createBlockElement(token);
    if (element) {
      parent.append(element);
    }
  });
}

function createBlockElement(token) {
  if (token.type === "space") {
    return null;
  }

  if (token.type === "heading") {
    const depth = Math.min(Math.max(token.depth || 2, 1), 6);
    const heading = document.createElement(`h${depth}`);
    appendInlineTokens(heading, token.tokens || [{ type: "text", text: token.text || "" }]);
    return heading;
  }

  if (token.type === "paragraph") {
    const paragraph = document.createElement("p");
    appendInlineTokens(paragraph, token.tokens || [{ type: "text", text: token.text || "" }]);
    return paragraph;
  }

  if (token.type === "text") {
    const paragraph = document.createElement("p");
    appendInlineTokens(paragraph, token.tokens || [{ type: "text", text: token.text || "" }]);
    return paragraph;
  }

  if (token.type === "list") {
    const list = document.createElement(token.ordered ? "ol" : "ul");
    (token.items || []).forEach((item) => {
      const listItem = document.createElement("li");
      appendBlockTokens(listItem, item.tokens || [{ type: "text", text: item.text || "" }]);
      list.append(listItem);
    });
    return list;
  }

  if (token.type === "blockquote") {
    const blockquote = document.createElement("blockquote");
    appendBlockTokens(blockquote, token.tokens || [{ type: "text", text: token.text || "" }]);
    return blockquote;
  }

  if (token.type === "code") {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = token.text || "";
    pre.append(code);
    return pre;
  }

  if (token.type === "table") {
    return createTableElement(token);
  }

  if (token.type === "hr") {
    return document.createElement("hr");
  }

  const paragraph = document.createElement("p");
  paragraph.textContent = token.text || token.raw || "";
  return paragraph;
}

function createTableElement(token) {
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  (token.header || []).forEach((cell) => {
    const th = document.createElement("th");
    appendInlineTokens(th, cell.tokens || [{ type: "text", text: cell.text || "" }]);
    headerRow.append(th);
  });

  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  (token.rows || []).forEach((row) => {
    const tableRow = document.createElement("tr");
    row.forEach((cell) => {
      const td = document.createElement("td");
      appendInlineTokens(td, cell.tokens || [{ type: "text", text: cell.text || "" }]);
      tableRow.append(td);
    });
    tbody.append(tableRow);
  });

  table.append(tbody);
  return table;
}

function appendInlineTokens(parent, tokens) {
  tokens.forEach((token) => {
    if (token.type === "strong" || token.type === "em" || token.type === "del") {
      const tagName = token.type === "strong" ? "strong" : token.type;
      const element = document.createElement(tagName);
      appendInlineTokens(element, token.tokens || [{ type: "text", text: token.text || "" }]);
      parent.append(element);
      return;
    }

    if (token.type === "codespan") {
      const code = document.createElement("code");
      code.textContent = token.text || "";
      parent.append(code);
      return;
    }

    if (token.type === "br") {
      parent.append(document.createElement("br"));
      return;
    }

    if (token.type === "link") {
      appendLinkToken(parent, token);
      return;
    }

    if (token.type === "image") {
      parent.append(document.createTextNode(token.text || token.href || ""));
      return;
    }

    parent.append(document.createTextNode(token.text || token.raw || ""));
  });
}

function appendLinkToken(parent, token) {
  const labelTokens = token.tokens || [{ type: "text", text: token.text || token.href || "" }];

  if (!isSafeLink(token.href)) {
    appendInlineTokens(parent, labelTokens);
    return;
  }

  const link = document.createElement("a");
  link.href = token.href;
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  appendInlineTokens(link, labelTokens);
  parent.append(link);
}

function isSafeLink(href) {
  try {
    const url = new URL(href, globalThis.location.href);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch (_error) {
    return false;
  }
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

function storageGet(defaults) {
  if (explainItUsesPromiseApi) {
    return explainItExt.storage.local.get(defaults);
  }

  return new Promise((resolve, reject) => {
    try {
      explainItExt.storage.local.get(defaults, (items) => {
        const error = explainItExt.runtime.lastError;
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

async function isExplainItEnabled() {
  const config = await storageGet({ enabled: true });
  return config.enabled !== false;
}

async function runAction(action, event) {
  const now = Date.now();
  if (now - explainItLastTrigger < EXPLAIN_IT_KEY_THROTTLE_MS) {
    return;
  }
  explainItLastTrigger = now;

  if (!(await isExplainItEnabled())) {
    return;
  }

  if (explainItRequestInFlight) { // flag to prevent multiple AI request running
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
