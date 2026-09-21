/**
 * Browser driver for the monster OPT reconstruction check (handoff section 6).
 *
 * Runs a headless Chrome through its DevTools protocol (no extra dependencies):
 *   1. mounts the production `NativeMonsterBody` on the isolated probe page and dumps the
 *      production tables plus the DOM geometry the component produced;
 *   2. screenshots every w x h clip viewport at 1:1, so the pixels the component actually
 *      painted can be compared with an independent OPT/PNG decode;
 *   3. runs the /battle-replay runtime check (console errors, failed asset requests, clip
 *      viewport geometry for every monster on the real stage, screenshots).
 *
 * Usage: node run_check.mjs --base http://127.0.0.1:5173 --out <evidence dir>
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

const CLIP_PROBE = `(() => {
  const rectOf = (node) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  };
  const styleOf = (node) => {
    const style = getComputedStyle(node);
    return {
      position: style.position,
      left: style.left,
      top: style.top,
      width: style.width,
      height: style.height,
      overflow: style.overflow,
      transform: style.transform,
    };
  };
  const items = [];
  for (const clip of document.querySelectorAll("div")) {
    const style = getComputedStyle(clip);
    if (style.overflow !== "hidden" || style.position !== "absolute") continue;
    const image = clip.querySelector(":scope > img");
    if (!image || !image.src.includes("/battle-assets/monster-original/")) continue;
    const cell = clip.parentElement;
    items.push({
      caseId: clip.closest("[data-ka-case]")?.dataset.kaCase ?? null,
      anchorRect: (() => {
        const element = clip.closest("[data-ka-case]");
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
      })(),
      src: new URL(image.src).pathname,
      sheet: image.src.split("/").pop().replace(".png", ""),
      clipRect: rectOf(clip),
      clipStyle: styleOf(clip),
      imgRect: rectOf(image),
      imgStyle: styleOf(image),
      natural: { w: image.naturalWidth, h: image.naturalHeight },
      complete: image.complete,
      cellRect: cell ? rectOf(cell) : null,
      cellStyle: cell ? styleOf(cell) : null,
    });
  }
  return items;
})()`;

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = { base: "http://127.0.0.1:5173", out: null, port: 9333, width: 1600, height: 1100 };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    const value = argv[i + 1];
    if (key === "port" || key === "width" || key === "height") out[key] = Number(value);
    else if (key === "css") out.css = value;
    else out[key] = value;
  }
  if (!out.out) throw new Error("--out is required");
  return out;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        this.pending.delete(message.id);
        if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
        else entry.resolve(message.result);
        return;
      }
      for (const listener of this.listeners) listener(message);
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

  on(fn) {
    this.listeners.push(fn);
  }
}

function makeCollector() {
  const state = { console: [], failures: [] };
  return {
    state,
    attach(cdp) {
      cdp.on((message) => {
        if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) {
          state.console.push({
            type: message.params.type,
            text: message.params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(" "),
          });
        }
        if (message.method === "Runtime.exceptionThrown") {
          state.console.push({
            type: "exception",
            text:
              message.params.exceptionDetails.exception?.description ??
              message.params.exceptionDetails.text,
          });
        }
        if (message.method === "Log.entryAdded" && ["error", "warning"].includes(message.params.entry.level)) {
          state.console.push({
            type: `log:${message.params.entry.level}`,
            text: message.params.entry.text,
            url: message.params.entry.url,
          });
        }
        if (message.method === "Network.responseReceived" && message.params.response.status >= 400) {
          state.failures.push({ url: message.params.response.url, status: message.params.response.status });
        }
        if (message.method === "Network.loadingFailed") {
          state.failures.push({ requestId: message.params.requestId, error: message.params.errorText });
        }
      });
    },
    reset() {
      state.console.length = 0;
      state.failures.length = 0;
    },
    snapshot() {
      return { console: [...state.console], failures: [...state.failures] };
    },
  };
}

async function launchChrome(port, width, height) {
  const binary = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!binary) throw new Error("no Chrome/Edge binary found");
  const profile = mkdtempSync(path.join(tmpdir(), "ka-opt-clip-"));
  const child = spawn(
    binary,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      "--force-device-scale-factor=1",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-gpu",
      "--mute-audio",
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true },
  );

  let version = null;
  for (let attempt = 0; attempt < 120 && !version; attempt += 1) {
    await sleep(150);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) version = await response.json();
    } catch {
      /* still starting */
    }
  }
  if (!version) throw new Error("chrome devtools endpoint never came up");
  return { child, binary, profile, version };
}

async function main() {
  const args = parseArgs();
  const out = path.resolve(args.out);
  const shotsDir = path.join(out, "shots");
  const pageShotsDir = path.join(out, "page-shots");
  mkdirSync(shotsDir, { recursive: true });
  mkdirSync(pageShotsDir, { recursive: true });

  const chrome = await launchChrome(args.port, args.width, args.height);
  const cdp = await Cdp.connect(chrome.version.webSocketDebuggerUrl);
  const logs = makeCollector();
  logs.attach(cdp);

  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });

  const send = (method, params) => cdp.send(method, params, sessionId);
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(
        `evaluate failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`,
      );
    }
    return result.result.value;
  };
  const shoot = async (rect, file) => {
    const capture = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: rect.x, y: rect.y, width: Math.round(rect.w), height: Math.round(rect.h), scale: 1 },
    });
    writeFileSync(file, Buffer.from(capture.data, "base64"));
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: args.width,
    height: args.height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  let loadFired = false;
  cdp.on((message) => {
    if (message.method === "Page.loadEventFired") loadFired = true;
  });
  const goto = async (url) => {
    loadFired = false;
    await send("Page.navigate", { url });
    const deadline = Date.now() + 30000;
    while (!loadFired && Date.now() < deadline) await sleep(100);
    if (!loadFired) throw new Error(`no load event for ${url}`);
    if (args.css) {
      /* control mode: re-apply a stylesheet constraint the component is meant to be immune to */
      await evaluate(`(() => {
        const style = document.createElement("style");
        style.dataset.kaControl = "1";
        style.textContent = ${JSON.stringify(args.css)};
        document.head.appendChild(style);
        return true;
      })()`);
    }
    await sleep(300);
  };

  /* ---------------- probe page: production component in isolation ---------------- */
  logs.reset();
  await goto(`${args.base}/tools/opt-clip-check/index.html`);
  const ready = await evaluate(`(async () => {
    for (let i = 0; i < 300; i += 1) {
      const images = Array.from(document.images);
      if (window.__OPT_PROBE__ && images.length > 0 && images.every((img) => img.complete && img.naturalWidth > 0)) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  })()`);
  if (!ready) throw new Error("probe page never became ready");
  await sleep(300);

  const probe = await evaluate("window.__OPT_PROBE__");
  writeFileSync(path.join(out, "ts-tables.json"), JSON.stringify(probe, null, 2));

  const harnessItems = await evaluate(CLIP_PROBE);
  const geometry = await evaluate(`(() => {
    const rectOf = (node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    };
    const cases = [];
    for (const element of document.querySelectorAll("[data-ka-case]")) {
      cases.push({ id: element.dataset.kaCase, anchor: rectOf(element) });
    }
    return {
      cases,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      dpr: window.devicePixelRatio,
      scroll: { x: window.scrollX, y: window.scrollY },
    };
  })()`);

  const shots = [];
  for (const item of harnessItems) {
    const shotName = `${item.sheet}__${Math.round(item.clipRect.x)}_${Math.round(item.clipRect.y)}.png`;
    await shoot(item.clipRect, path.join(shotsDir, shotName));
    shots.push({ file: `shots/${shotName}`, ...item });
  }

  /* one capture of every 80x60 logical cell box: whatever the component paints outside its own
     component viewports shows up there, which is how a "crop became a fit" defect is caught. */
  const cellShots = [];
  const seenCases = new Set();
  for (const item of harnessItems) {
    if (!item.caseId || seenCases.has(item.caseId) || !item.cellRect) continue;
    seenCases.add(item.caseId);
    const file = `shots/${item.caseId}__cell.png`;
    await shoot(item.cellRect, path.join(shotsDir, `${item.caseId}__cell.png`));
    cellShots.push({ caseId: item.caseId, file, rect: item.cellRect, side: item.caseId.split("-")[2] });
  }

  const harnessCheck = logs.snapshot();
  writeFileSync(
    path.join(out, "harness-geometry.json"),
    JSON.stringify(
      {
        ...geometry,
        items: shots,
        cellShots,
        console: harnessCheck.console,
        failures: harnessCheck.failures,
      },
      null,
      2,
    ),
  );
  writeFileSync(path.join(out, "harness-shots.json"), JSON.stringify(shots, null, 2));

  /* ---------------- real page: runtime check ---------------- */
  logs.reset();
  await goto(`${args.base}/battle-replay`);
  await evaluate(`(async () => {
    for (let i = 0; i < 300; i += 1) {
      const images = Array.from(document.images);
      if (images.length > 0 && images.every((img) => img.complete)) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  })()`);
  await sleep(900);

  const pageItems = await evaluate(CLIP_PROBE);
  const pageStage = await evaluate(`(() => {
    const stages = Array.from(document.querySelectorAll("div")).filter((node) =>
      (node.getAttribute("style") || "").includes("background-image"),
    );
    if (!stages.length) return null;
    const rect = stages[0].getBoundingClientRect();
    return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  })()`);
  const pageState = await evaluate(`(() => ({
    url: location.href,
    title: document.title,
    brokenImages: Array.from(document.images)
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.src),
    dpr: window.devicePixelRatio,
    unitCount: document.querySelectorAll('[class*="translate"]').length,
  }))()`);
  const initial = logs.snapshot();
  if (pageStage) {
    await shoot(pageStage, path.join(pageShotsDir, "battle-replay-stage.png"));
  }
  const pageShot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(path.join(pageShotsDir, "battle-replay-page.png"), Buffer.from(pageShot.data, "base64"));

  const encounterLabels = await evaluate(`(() => {
    const labels = [];
    Array.from(document.querySelectorAll("button")).forEach((node) => {
      const text = (node.textContent || "").trim();
      if (/Wairo|Kairo/.test(text)) labels.push(text.slice(0, 60));
    });
    return labels;
  })()`);

  const encounterRuns = [];
  for (let index = 0; index < encounterLabels.length; index += 1) {
    logs.reset();
    await evaluate(`(() => {
      const nodes = Array.from(document.querySelectorAll("button")).filter((node) => /Wairo|Kairo/.test(node.textContent || ""));
      nodes[${index}]?.click();
      return true;
    })()`);
    await sleep(900);
    const items = await evaluate(CLIP_PROBE);
    const state = await evaluate(`(() => ({
      brokenImages: Array.from(document.images)
        .filter((img) => img.complete && img.naturalWidth === 0)
        .map((img) => img.src),
    }))()`);
    encounterRuns.push({
      label: encounterLabels[index],
      monsterClipBoxes: items.length,
      sheets: [...new Set(items.map((item) => item.sheet))].sort(),
      brokenImages: state.brokenImages,
      ...logs.snapshot(),
    });
  }

  writeFileSync(
    path.join(out, "page-check.json"),
    JSON.stringify(
      {
        chrome: { binary: chrome.binary, version: chrome.version.Browser },
        page: { ...pageState, stage: pageStage },
        clipBoxes: pageItems,
        initialConsole: initial.console,
        initialFailures: initial.failures,
        encounters: encounterRuns,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        probeCases: geometry.cases.length,
        harnessClipItems: harnessItems.length,
        harnessConsole: harnessCheck.console,
        harnessFailures: harnessCheck.failures,
        pageClipBoxes: pageItems.length,
        pageSheets: pageItems.reduce((acc, item) => ({ ...acc, [item.sheet]: (acc[item.sheet] ?? 0) + 1 }), {}),
        pageBrokenImages: pageState.brokenImages.length,
        pageConsole: initial.console.length,
        pageFailures: initial.failures,
        encounters: encounterRuns.map((entry) => ({
          label: entry.label,
          monsters: entry.monsterClipBoxes,
          sheets: entry.sheets.length,
          console: entry.console.length,
          broken: entry.brokenImages.length,
        })),
      },
      null,
      2,
    ),
  );

  await cdp.send("Browser.close").catch(() => {});
  chrome.child.kill();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
