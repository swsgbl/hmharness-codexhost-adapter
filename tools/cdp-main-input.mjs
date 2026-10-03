#!/usr/bin/env node
import assert from "node:assert/strict";

const port = Number(process.argv[2]);
const action = process.argv[3];
const x = Number(process.argv[4]);
const y = Number(process.argv[5]);
assert(Number.isInteger(port) && port > 0 && port < 65536, "Usage: node cdp-main-input.mjs <port> click <x> <y>");
assert.equal(action, "click", "Only click is supported");
assert(Number.isFinite(x) && Number.isFinite(y), "Numeric x and y are required");

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
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    const result = await call("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    if (result.error) throw new Error(JSON.stringify(result.error));
  }
  console.log(JSON.stringify({ clicked: true, x, y }));
} finally {
  socket.close();
}
