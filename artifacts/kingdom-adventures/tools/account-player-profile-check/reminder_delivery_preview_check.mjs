import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const source = readFileSync(new URL("../../src/pages/event-reminder-app.tsx", import.meta.url), "utf8");
const declaration = source.match(/  const deliveryChannels = .*;/)[0];
const start = source.indexOf("  const subscribe = async (option:");
const end = source.indexOf("  const unsubscribe =", start);
const snippet = ts.transpileModule(`${declaration}\n${source.slice(start, end)}\nsubscribe(option)`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
for (const embedded of [true, false]) {
  const channels = { push: true, telegram: true, discord: false };
  let pushCalls = 0;
  let sent;
  await runInNewContext(snippet, {
    embedded, channels, targets: { telegramChatId: "12345" }, clientId: "test-only", option: { id: "test", title: "Test", mode: "start", definition: {}, offsetHours: 0 },
    setBusyId() {}, setReminderErrors() {}, setMessage() {}, setSaved() {}, syncStatus: async () => {},
    apiUrl: (path) => path, subscribeBrowserPush: async () => { pushCalls++; return { toJSON: () => ({ endpoint: "test-only" }) }; },
    fetch: async (_url, request) => { sent = JSON.parse(request.body); return { ok: true }; },
  });
  assert.equal(pushCalls, embedded ? 0 : 1);
  assert.equal(sent.channels.push, !embedded);
  assert.equal(sent.channels.telegram, true);
  assert.deepEqual(channels, { push: true, telegram: true, discord: false }, "Legacy preference must stay unchanged");
}
console.log(JSON.stringify({ ok: true, profileActionsUseTelegramDiscordOnly: true, standaloneBrowserPushRetained: true, legacyPreferenceUnchanged: true, externalMessagesSent: 0 }));
