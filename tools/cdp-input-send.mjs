#!/usr/bin/env node
import process from "node:process";

const [port, marker] = process.argv.slice(2);
if (!port || !marker) {
  throw new Error("Usage: node tools/cdp-input-send.mjs <cdp-port> <marker>");
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

function evaluate(expression) {
  return call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
}

async function clickAt(x, y) {
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
}

await opened;
await call("Runtime.enable");
const newChatResult = await evaluate(`(() => {
  const button = [...document.querySelectorAll("button")]
    .find((candidate) => ["New chat", "新对话"].includes(candidate.getAttribute("aria-label")) || ["New chat", "新对话"].includes(candidate.innerText.trim()));
  if (!button) return null;
  const rect = button.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
})()`);
if (newChatResult.exceptionDetails) throw new Error(newChatResult.exceptionDetails.exception?.description);
if (newChatResult.result.value) {
  const newChat = newChatResult.result.value;
  await clickAt(newChat.x, newChat.y);
  await new Promise((resolve) => setTimeout(resolve, 700));
}
let statusResult = await evaluate(`window.__codexhostRendererBindingProbeV1?.status?.() ?? null`);
if (statusResult.exceptionDetails) throw new Error(statusResult.exceptionDetails.exception?.description);
let status = statusResult.result.value;
if (status?.selections?.[0]?.agent !== "hmharness") {
  const triggerResult = await evaluate(`(() => {
    const trigger = [...document.querySelectorAll("button")]
      .find((button) => (button.getAttribute("aria-label") || "").startsWith("Select Agent, current "));
    if (!trigger) return null;
    const rect = trigger.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (triggerResult.exceptionDetails) throw new Error(triggerResult.exceptionDetails.exception?.description);
  if (triggerResult.result.value) {
    const trigger = triggerResult.result.value;
    await clickAt(trigger.x, trigger.y);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const optionResult = await evaluate(`(() => {
    const option = [...document.querySelectorAll("button")]
      .filter((button) => !button.disabled)
      .find((button) => button.innerText.trim() === "HMHarness");
    if (!option) throw new Error("HMHarness agent option not found");
    const rect = option.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (optionResult.exceptionDetails) throw new Error(optionResult.exceptionDetails.exception?.description);
  const option = optionResult.result.value;
  await clickAt(option.x, option.y);
  await new Promise((resolve) => setTimeout(resolve, 800));
  statusResult = await evaluate(`window.__codexhostRendererBindingProbeV1?.status?.() ?? null`);
  if (statusResult.exceptionDetails) throw new Error(statusResult.exceptionDetails.exception?.description);
  status = statusResult.result.value;
  if (status?.selections?.[0]?.agent !== "hmharness") {
    throw new Error(`HMHarness selection failed: ${JSON.stringify(status?.selections ?? [])}`);
  }
}

const focused = await evaluate(`(() => {
  const editor = [...document.querySelectorAll("[contenteditable=true]")]
    .find((element) => ["Do anything", "随心输入"].includes(element.getAttribute("aria-label")));
  if (!editor) throw new Error("Composer not found");
  editor.focus();
  const selection = window.getSelection();
  selection.selectAllChildren(editor);
  return { text: editor.textContent };
})()`);
if (focused.exceptionDetails) throw new Error(focused.exceptionDetails.exception?.description);

await call("Input.insertText", { text: marker });
await new Promise((resolve) => setTimeout(resolve, 100));
const sendResult = await evaluate(`(() => {
  const editor = [...document.querySelectorAll("[contenteditable=true]")]
    .find((element) => ["Do anything", "随心输入"].includes(element.getAttribute("aria-label")));
  const send = [...document.querySelectorAll("button")]
    .find((button) => ["Send", "发送"].includes(button.getAttribute("aria-label")));
  if (!editor || !send) throw new Error("Composer controls not found");
  const rect = send.getBoundingClientRect();
  return {
    text: editor.textContent,
    disabled: send.disabled,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
})()`);
if (sendResult.exceptionDetails) throw new Error(sendResult.exceptionDetails.exception?.description);
const send = sendResult.result.value;
if (send.text !== marker) throw new Error(`Composer text mismatch: ${send.text}`);
if (send.disabled) throw new Error("Send button is disabled");

await clickAt(send.x, send.y);
await new Promise((resolve) => setTimeout(resolve, 250));
const after = await evaluate(`window.__codexhostRendererBindingProbeV1?.status?.() ?? null`);
if (after.exceptionDetails) throw new Error(after.exceptionDetails.exception?.description);
websocket.close();
console.log(JSON.stringify({ marker, composerText: send.text, status: after.result.value }, null, 2));
