#!/usr/bin/env node
import assert from "node:assert/strict";

const port = Number(process.argv[2]);
const expression = process.argv[3];
assert(Number.isInteger(port) && port > 0 && port < 65536, "Usage: node cdp-main-evaluate.mjs <port> <expression>");
assert(typeof expression === "string" && expression.length > 0, "A JavaScript expression is required");

const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
const main = targets.filter((target) => target.url === "app://-/index.html" && target.type === "page");
assert.equal(main.length, 1, `Expected exactly one main CodexHost renderer, found ${main.length}`);

const socket = new WebSocket(main[0].webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;

function call(method, params = {}) {
  const id = nextId++;
  const promise = Promise.withResolvers();
  pending.set(id, promise);
  socket.send(JSON.stringify({ id, method, params }));
  return promise.promise;
}

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id).resolve(message);
    pending.delete(message.id);
  }
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

try {
  const result = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.error || result.result?.exceptionDetails) {
    const details = result.error ?? result.result.exceptionDetails;
    throw new Error(JSON.stringify(details));
  }
  console.log(JSON.stringify(result.result.result.value, null, 2));
} finally {
  socket.close();
}
