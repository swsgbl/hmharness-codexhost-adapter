#!/usr/bin/env node
import process from "node:process";

const [port] = process.argv.slice(2);
if (!port) {
  throw new Error("Usage: node tools/cdp-locale.mjs <cdp-port>");
}

const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = pages.find((candidate) => candidate.type === "page" && candidate.url.startsWith("app://"));
if (!page) throw new Error("Codex Desktop page was not found through CDP");

const websocket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;

function call(method, params = {}) {
  const id = nextId++;
  const promise = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    websocket.send(JSON.stringify({ id, method, params }));
  });
  return promise;
}

websocket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id === undefined) return;
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(message.error.message));
  else entry.resolve(message.result);
});

await new Promise((resolve, reject) => {
  websocket.addEventListener("open", resolve, { once: true });
  websocket.addEventListener("error", reject, { once: true });
});
await call("Runtime.enable");

const expression = String.raw`
(() => {
  const rootElement = document.getElementById("root");
  const reactContainerKey = rootElement
    ? Object.getOwnPropertyNames(rootElement).find((key) => key.startsWith("__reactContainer$"))
    : null;
  const roots = [
    rootElement && reactContainerKey ? rootElement[reactContainerKey]?.current : null,
    window.__codexRoot?._internalRoot?.current,
  ].filter(Boolean);
  const seen = new Set();
  let provider = null;

  function visit(fiber, depth) {
    if (!fiber || seen.has(fiber) || provider || depth > 500) return;
    seen.add(fiber);
    if (fiber.type?.displayName === "IntlProvider" || fiber.type?.name === "IntlProvider") {
      provider = fiber;
      return;
    }
    visit(fiber.child, depth + 1);
    if (provider) return;
    visit(fiber.sibling, depth);
  }
  roots.forEach((root) => visit(root, 0));

  const statsig = window.__STATSIG__;
  const statsigClient = statsig?.firstInstance ?? statsig?.instance ?? null;
  let layer = null;
  let layerError = null;
  try {
    layer = statsigClient?.getLayer?.("72216192") ?? null;
  } catch (error) {
    layerError = String(error);
  }

  const messages = provider?.memoizedProps?.messages;
  const messageKeys = messages && typeof messages === "object" ? Object.keys(messages) : [];
  const visibleText = document.body.innerText;
  const requiredChineseText = ["文件", "编辑", "视图", "帮助", "新对话"];
  return {
    pageUrl: location.href,
    navigatorLanguage: navigator.language,
    documentLanguage: document.documentElement.lang,
    provider: {
      found: provider !== null,
      locale: provider?.memoizedProps?.locale ?? null,
      defaultLocale: provider?.memoizedProps?.defaultLocale ?? null,
      messageCount: messageKeys.length,
      firstKey: messageKeys[0] ?? null,
      firstValue: messageKeys.length ? messages[messageKeys[0]] : null,
    },
    statsig: {
      windowPatchInstalled: window.__codexhostI18nGatePatch === true,
      clientPatchInstalled: statsigClient?.__codexhostI18nGatePatch === true,
      enableI18n: layer?.get?.("enable_i18n") ?? null,
      localeSource: layer?.get?.("locale_source") ?? null,
      layerError,
    },
    visibleChineseUi: {
      requiredTextPresent: requiredChineseText.every((text) => visibleText.includes(text)),
      menuText: requiredChineseText,
    },
  };
})()
`;

const result = await call("Runtime.evaluate", {
  expression,
  awaitPromise: true,
  returnByValue: true,
});
websocket.close();
if (result.exceptionDetails) {
  throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
}
console.log(JSON.stringify(result.result.value, null, 2));
