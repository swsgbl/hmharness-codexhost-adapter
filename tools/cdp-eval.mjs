#!/usr/bin/env node
import process from "node:process";

const [port, expression] = process.argv.slice(2);
if (!port || !expression) {
  throw new Error("Usage: node tools/cdp-eval.mjs <cdp-port> <javascript-expression>");
}

const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = pages.find((candidate) => candidate.type === "page" && candidate.url.startsWith("app://"));
if (!page) throw new Error("Codex Desktop page was not found through CDP");

const websocket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;

function call(method, params = {}) {
  const id = nextId++;
  const message = { id, method, params };
  const promise = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    websocket.send(JSON.stringify(message));
  });
  return promise;
}

const opened = new Promise((resolve, reject) => {
  websocket.addEventListener("open", resolve, { once: true });
  websocket.addEventListener("error", reject, { once: true });
});
websocket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id === undefined) return;
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(message.error.message));
  else entry.resolve(message.result);
});

await opened;
await call("Runtime.enable");
const result = await call("Runtime.evaluate", {
  expression,
  awaitPromise: true,
  returnByValue: true,
});
websocket.close();
if (result.exceptionDetails) {
  const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
  throw new Error(detail);
}
console.log(JSON.stringify(result.result.value, null, 2));
