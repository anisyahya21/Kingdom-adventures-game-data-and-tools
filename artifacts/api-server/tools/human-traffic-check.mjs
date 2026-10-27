import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as policy from "../../kingdom-adventures/src/lib/analytics-policy.js";

for (const agent of [
  "Googlebot/2.1",
  "ExaSearchBot/1.0",
  "HeadlessChrome/145",
  "Playwright",
  "DuckAssistBot/1.2",
  "curl/8.0",
  "",
])
  assert.equal(policy.isAutomationUserAgent(agent), true, agent);
assert.equal(
  policy.isAutomationUserAgent(
    "Mozilla/5.0 (Linux; Android 12; CUBOT) AppleWebKit/537.36 Chrome/145.0 Mobile Safari/537.36",
  ),
  false,
);
assert.equal(
  policy.isAnalyticsOrigin(
    "https://kingdom-adventures-community-tools.vercel.app",
  ),
  true,
);
for (const origin of [
  "http://localhost:5186",
  "https://random-preview.vercel.app",
  "https://kingdom-adventures-community-tools.vercel.app.evil.example",
  "",
])
  assert.equal(policy.isAnalyticsOrigin(origin), false);

const source = fs.readFileSync(
  new URL("../../kingdom-adventures/src/lib/analytics.ts", import.meta.url),
  "utf8",
);
async function simulate(overrides = {}) {
  const options = {
    prod: true,
    origin: "https://kingdom-adventures-community-tools.vercel.app",
    agent: "Mozilla/5.0 Firefox/144.0",
    webdriver: false,
    disabled: false,
    brokenStorage: false,
    ...overrides,
  };
  const requests = [];
  const storage = {
    getItem() {
      if (options.brokenStorage) throw new Error("Storage unavailable");
      return "stable-id";
    },
    setItem() {},
  };
  const exports = {};
  runInNewContext(
    ts.transpileModule(
      source.replaceAll("import.meta.env.PROD", String(options.prod)),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      exports,
      require: (name) =>
        name === "./analytics-policy"
          ? policy
          : { configuredApiBase: () => "" },
      window: {
        location: { origin: options.origin },
        localStorage: storage,
        sessionStorage: storage,
        __KA_DISABLE_ANALYTICS__: options.disabled,
      },
      navigator: { webdriver: options.webdriver, userAgent: options.agent },
      document: { referrer: "" },
      crypto,
      fetch: async (url, init) => {
        requests.push({ url, body: JSON.parse(init.body) });
        return {};
      },
    },
  );
  await exports.trackPageView("/equipment");
  return requests;
}
assert.equal((await simulate()).length, 1);
for (const options of [
  { prod: false },
  { origin: "http://localhost:5186" },
  { origin: "https://preview.vercel.app" },
  { webdriver: true },
  { agent: "HeadlessChrome/145" },
  { agent: "Googlebot/2.1" },
  { disabled: true },
  { brokenStorage: true },
])
  assert.equal((await simulate(options)).length, 0);
console.log(
  JSON.stringify({
    result: "PASS",
    checks: [
      "explicit automation signatures",
      "real CUBOT browser preserved",
      "canonical source validation",
      "production browser collected",
      "local/preview/development/automation suppressed",
      "blocked storage never breaks navigation",
    ],
  }),
);
