#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const [port, rendererPath] = process.argv.slice(2);
if (!port || !rendererPath) {
  throw new Error(
    "Usage: node tools/cdp-renderer-diagnose.mjs <cdp-port> <renderer-extension.js>",
  );
}

const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = pages.find(
  (candidate) => candidate.type === "page" && candidate.url === "app://-/index.html",
);
if (!page) throw new Error("Codex Desktop page was not found through CDP");

const renderer = await readFile(path.resolve(rendererPath), "utf8");
const source = [
  "globalThis.__zod_globalConfig ??= {}; globalThis.__zod_globalConfig.jitless = true;",
  'Object.defineProperty(window, "__codexhostProductionConfigV1", { configurable: true, value: { defaultAgent: "codex" } });',
  renderer,
].join("\n");

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
const result = await call("Runtime.evaluate", {
  expression: source,
  awaitPromise: true,
  returnByValue: true,
});
websocket.close();

console.log(
  JSON.stringify(
    {
      pageUrl: page.url,
      exceptionDetails: result.exceptionDetails ?? null,
    },
    null,
    2,
  ),
);
