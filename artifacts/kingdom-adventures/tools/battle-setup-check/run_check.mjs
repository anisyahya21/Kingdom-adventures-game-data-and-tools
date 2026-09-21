/**
 * Focused browser check for PASS 16 COMMAND 16.2 and the COMMAND 16.3 adapter.
 *
 * Opens the Vite-served harness, waits for its model/DOM checks, and writes the result JSON.
 * COMMAND 16.3 additionally feeds every adapter fixture scenario through the authoritative Python
 * loader (`combat_scenario.load_scenario` + `combat_setup.prepare_setup`) with verify_adapter.py.
 *
 * Usage: node run_check.mjs --base http://127.0.0.1:5173 --out <evidence dir>
 */
import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(here, "..", "..", "..", "..", "..");

const PYTHON_CANDIDATES = [
  path.join(WORKSPACE, ".venv", "Scripts", "python.exe"),
  "python",
  "py",
];

function runAdapterVerifier(harnessFile, outFile) {
  const script = path.join(here, "verify_adapter.py");
  for (const candidate of PYTHON_CANDIDATES) {
    const result = spawnSync(
      candidate,
      [script, "--harness", harnessFile, "--out", outFile],
      { encoding: "utf8", windowsHide: true },
    );
    if (result.error && result.error.code === "ENOENT") continue;
    if (result.error) throw result.error;
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    return result.status === 0;
  }
  throw new Error("no Python interpreter found for the adapter verifier");
}

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

const parseArgs = () => {
  const argv = process.argv.slice(2);
  const out = { base: "http://127.0.0.1:5173", out: null, port: 9342 };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    out[key] = key === "port" ? Number(argv[i + 1]) : argv[i + 1];
  }
  if (!out.out) throw new Error("--out is required");
  return out;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id === undefined) return;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
    };
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error(`could not open ${url}`));
    });
    return new Cdp(ws);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }
}

async function run() {
  const args = parseArgs();
  const out = path.resolve(args.out);
  mkdirSync(out, { recursive: true });
  const binary = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!binary) throw new Error("no Chrome/Edge binary found");
  const profile = mkdtempSync(path.join(tmpdir(), "ka-battle-setup-"));
  const child = spawn(
    binary,
    [
      "--headless=new",
      `--remote-debugging-port=${args.port}`,
      `--user-data-dir=${profile}`,
      "--window-size=1600,1200",
      "--force-device-scale-factor=1",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true },
  );
  let version = null;
  for (let attempt = 0; attempt < 120 && !version; attempt += 1) {
    await sleep(150);
    try {
      const response = await fetch(`http://127.0.0.1:${args.port}/json/version`);
      if (response.ok) version = await response.json();
    } catch {
      /* still starting */
    }
  }
  if (!version) throw new Error("chrome devtools endpoint never came up");
  const cdp = await Cdp.connect(version.webSocketDebuggerUrl);
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => cdp.send(method, params, sessionId);
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: `${args.base}/tools/battle-setup-check/index.html` });
  let result = null;
  for (let attempt = 0; attempt < 160 && !result; attempt += 1) {
    await sleep(100);
    result = await evaluate("window.__battleSetupCheck ?? null");
  }
  const harnessFile = path.join(out, "battle-setup-check.json");
  writeFileSync(harnessFile, JSON.stringify(result, null, 2));

  const verifyFile = path.join(out, "adapter-verify.json");
  let adapterOk = false;
  let adapter = null;
  if (result?.adapter?.fixtures) {
    try {
      adapterOk = runAdapterVerifier(harnessFile, verifyFile);
      adapter = JSON.parse(readFileSync(verifyFile, "utf8"));
    } catch (error) {
      console.error(`adapter verifier failed: ${error}`);
    }
  } else {
    console.error("the harness did not produce adapter fixtures");
  }

  console.log(
    JSON.stringify(
      {
        harness: {
          passed: result?.passed ?? 0,
          total: result?.total ?? 0,
          failed: result?.failed ?? ["harness did not complete"],
        },
        adapter: adapter
          ? { passed: adapter.passed, total: adapter.total, failed: adapter.failed }
          : "authoritative loader verification did not run",
      },
      null,
      1,
    ),
  );
  await cdp.send("Browser.close").catch(() => {});
  child.kill();
  if (!result || result.failed?.length || !adapterOk) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
