/**
 * Browser driver for the SEB frame/line selection check.
 *
 * 1. dumps the production helpers' resolved records for every clip/line/frame probe;
 * 2. screenshots the painted `w x h` viewports and the `80x60` logical cells of the rendered
 *    cases, so the selected cells can be compared with the OPT crops;
 * 3. runs the /battle-replay runtime check (console errors, broken images, monster viewports).
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
    const lineOrigin = cell ? cell.parentElement : null;
    const unitRoot = lineOrigin && lineOrigin.closest ? lineOrigin.closest(".absolute") : null;
    const caseElement = clip.closest("[data-ka-case]");
    items.push({
      caseId: caseElement?.dataset.kaCase ?? null,
      anchorRect: caseElement ? rectOf(caseElement) : null,
      unitRootRect: unitRoot ? rectOf(unitRoot) : null,
      unitRootTransform: unitRoot ? getComputedStyle(unitRoot).transform : null,
      src: new URL(image.src).pathname,
      sheet: image.src.split("/").pop().replace(".png", ""),
      clipRect: rectOf(clip),
      clipStyle: styleOf(clip),
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
  const out = { base: "http://127.0.0.1:5173", out: null, port: 9334, width: 1600, height: 1100 };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    const value = argv[i + 1];
    if (["port", "width", "height"].includes(key)) out[key] = Number(value);
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
    attach(cdp) {
      cdp.on((message) => {
        if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) {
          state.console.push({ type: message.params.type, text: message.params.args.map((a) => a.value ?? a.description ?? a.type).join(" ") });
        }
        if (message.method === "Runtime.exceptionThrown") {
          state.console.push({ type: "exception", text: message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text });
        }
        if (message.method === "Log.entryAdded" && ["error", "warning"].includes(message.params.entry.level)) {
          state.console.push({ type: `log:${message.params.entry.level}`, text: message.params.entry.text, url: message.params.entry.url });
        }
        if (message.method === "Network.responseReceived" && message.params.response.status >= 400) {
          state.failures.push({ url: message.params.response.url, status: message.params.response.status });
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

async function main() {
  const args = parseArgs();
  const out = path.resolve(args.out);
  const shotsDir = path.join(out, "shots");
  const pageShotsDir = path.join(out, "page-shots");
  mkdirSync(shotsDir, { recursive: true });
  mkdirSync(pageShotsDir, { recursive: true });

  const binary = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!binary) throw new Error("no Chrome/Edge binary found");
  const profile = mkdtempSync(path.join(tmpdir(), "ka-seb-"));
  const child = spawn(
    binary,
    [
      "--headless=new",
      `--remote-debugging-port=${args.port}`,
      `--user-data-dir=${profile}`,
      `--window-size=${args.width},${args.height}`,
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
  const logs = makeCollector();
  logs.attach(cdp);
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => cdp.send(method, params, sessionId);
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(`evaluate failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
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
  await send("Emulation.setDeviceMetricsOverride", { width: args.width, height: args.height, deviceScaleFactor: 1, mobile: false });

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
    await sleep(300);
  };

  logs.reset();
  await goto(`${args.base}/tools/seb-frame-check/index.html`);
  const ready = await evaluate(`(async () => {
    for (let i = 0; i < 300; i += 1) {
      const images = Array.from(document.images);
      if (window.__SEB_PROBE__ && images.length > 0 && images.every((img) => img.complete && img.naturalWidth > 0)) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  })()`);
  if (!ready) throw new Error("probe page never became ready");

  const probe = await evaluate("window.__SEB_PROBE__");
  writeFileSync(path.join(out, "seb-probe.json"), JSON.stringify(probe, null, 2));

  const items = await evaluate(CLIP_PROBE);
  const shots = [];
  for (const item of items) {
    const file = `shots/${item.caseId}__${item.sheet}__${Math.round(item.clipRect.x)}_${Math.round(item.clipRect.y)}.png`;
    await shoot(item.clipRect, path.join(out, file));
    shots.push({ file, ...item });
  }
  const cellShots = [];
  const seen = new Set();
  for (const item of items) {
    if (!item.caseId || seen.has(item.caseId) || !item.cellRect) continue;
    seen.add(item.caseId);
    const file = `shots/${item.caseId}__cell.png`;
    await shoot(item.cellRect, path.join(out, file));
    cellShots.push({ caseId: item.caseId, file, rect: item.cellRect });
  }
  const harness = logs.snapshot();
  writeFileSync(
    path.join(out, "seb-geometry.json"),
    JSON.stringify({ items: shots, cellShots, console: harness.console, failures: harness.failures }, null, 2),
  );

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
  const pageState = await evaluate(`(() => ({
    url: location.href,
    title: document.title,
    brokenImages: Array.from(document.images).filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.src),
  }))()`);
  const initial = logs.snapshot();
  const pageShot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(path.join(pageShotsDir, "battle-replay.png"), Buffer.from(pageShot.data, "base64"));

  /* ---- runtime SEB trace: turn on the debug overlay and sample the live rows per encounter ---- */
  const switchOk = await evaluate(`(() => {
    const switches = Array.from(document.querySelectorAll('button[role="switch"]'));
    const index = switches.findIndex((el) => (el.closest("div")?.textContent ?? "").includes("Debug: SEB frame / line selection"));
    if (index < 0) return null;
    if (switches[index].getAttribute("aria-checked") !== "true") switches[index].click();
    return index;
  })()`);
  await sleep(400);
  const trace = { switchIndex: switchOk, encounters: [] };
  const encounters = await evaluate(
    `Array.from(document.querySelectorAll("button")).filter((node) => /Wairo|Kairo/.test(node.textContent || "")).map((node) => node.textContent.trim().slice(0, 60))`,
  );
  for (let index = 0; index < encounters.length; index += 1) {
    await evaluate(`(() => {
      const nodes = Array.from(document.querySelectorAll("button")).filter((node) => /Wairo|Kairo/.test(node.textContent || ""));
      nodes[${index}]?.click();
      return true;
    })()`);
    await sleep(500);
    const seen = new Map();
    const samples = [];
    for (let sample = 0; sample < 26; sample += 1) {
      /* rows and placements are read in one evaluation so they describe the same frame */
      const snapshotSample = await evaluate(`(() => {
        const rectOf = (node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
        /* The page draws a fixed 481x197 logical scene through one presentation transform, so browser
           rects are *displayed* pixels. The SEB records are in logical pixels; divide the measured
           displacement by the scene's own per-axis scale to compare the two in logical space. The
           presentation applies the native 196/192 vertical stretch, so X and Y scales differ. */
        const scene = document.querySelector('div[style*="background-image"]');
        const sceneScale = scene ? scene.getBoundingClientRect().width / Number(scene.dataset.sceneWidth || 481) : 1;
        const sceneScaleY = scene ? scene.getBoundingClientRect().height / Number(scene.dataset.sceneHeight || 197) : 1;
        const rows = Array.from(document.querySelectorAll("span")).filter((el) => /^m\\d+ /.test(el.textContent || "")).map((el) => el.textContent);
        const placements = [];
        for (const clip of document.querySelectorAll("div")) {
          const style = getComputedStyle(clip);
          if (style.overflow !== "hidden" || style.position !== "absolute") continue;
          const image = clip.querySelector(":scope > img");
          if (!image || !image.src.includes("/battle-assets/monster-original/")) continue;
          const cell = clip.parentElement;
          const lineOrigin = cell ? cell.parentElement : null;
          const root = lineOrigin && lineOrigin.closest ? lineOrigin.closest(".absolute") : null;
          if (!cell || !lineOrigin || !root) continue;
          const rootRect = rectOf(root);
          const cellRect = rectOf(cell);
          const clipRect = rectOf(clip);
          const displayedLineOffset = [cellRect.x - rootRect.x, cellRect.y - rootRect.y];
          placements.push({
            sheet: image.src.split("/").pop().replace(".png", ""),
            lineOffset: [
              Math.round(displayedLineOffset[0] / sceneScale),
              Math.round(displayedLineOffset[1] / sceneScaleY),
            ],
            displayedLineOffset: [
              +displayedLineOffset[0].toFixed(3),
              +displayedLineOffset[1].toFixed(3),
            ],
            sceneScale: +sceneScale.toFixed(6),
            sceneScaleY: +sceneScaleY.toFixed(6),
            optOffset: [
              Math.round((clipRect.x - cellRect.x) / sceneScale),
              Math.round((clipRect.y - cellRect.y) / sceneScaleY),
            ],
            viewProfile: {
              id: scene ? scene.dataset.viewProfile || null : null,
              logicalViewWidth: scene ? Number(scene.dataset.logicalViewWidth || 0) : null,
              backgroundX: scene ? Number(scene.dataset.backgroundX ?? "NaN") : null,
              verticalRatio: scene ? Number(scene.dataset.verticalRatio ?? "NaN") : null,
            },
            unitTransform: getComputedStyle(root).transform,
          });
        }
        return { t: Date.now(), rows, placements };
      })()`);
      const rows = snapshotSample.rows;
      samples.push(snapshotSample);
      for (const row of rows) {
        const full = row.match(
          /^m(\d+) (\w+) dir (\w+)\((\d)\) asset ([\w,]+) mirror u(\d) v(\d) (\S+) f(\d+) L(\d+) tex(-?\d+) u(-?\d+) v(-?\d+) w(\d+) h(\d+) tX(-?\d+) tY(-?\d+) rU(\d+) rV(\d+) img (\S+)/,
        );
        if (full) {
          const [
            , monsterId, state, direction, directionIndex, asset, mirrorU, mirrorV, seb, frame, line,
            tex, u, v, w, h, transX, transY, reversU, reversV, image,
          ] = full;
          const key = `${monsterId}|${seb}|${frame}|${line}`;
          if (!seen.has(key)) {
            seen.set(key, {
              monsterId: Number(monsterId),
              state,
              direction,
              directionIndex: Number(directionIndex),
              asset,
              mirror: { u: mirrorU === "1", v: mirrorV === "1" },
              seb,
              frame: Number(frame),
              line: Number(line),
              record: {
                tex: Number(tex),
                u: Number(u),
                v: Number(v),
                w: Number(w),
                h: Number(h),
                transX: Number(transX),
                transY: Number(transY),
                reversU: Number(reversU),
                reversV: Number(reversV),
                image,
              },
            });
          }
          continue;
        }
        const none = row.match(/^m(\d+) (\w+) dir (\w+)\((\d)\) asset ([\w,]+) mirror u(\d) v(\d) (\S+) f(\d+) L(\d+) · no record/);
        if (none) {
          const [, monsterId, state, direction, directionIndex, asset, mirrorU, mirrorV, seb, frame, line] = none;
          const key = `${monsterId}|${seb}|${frame}|${line}`;
          if (!seen.has(key)) {
            seen.set(key, {
              monsterId: Number(monsterId),
              state,
              direction,
              directionIndex: Number(directionIndex),
              asset,
              mirror: { u: mirrorU === "1", v: mirrorV === "1" },
              seb,
              frame: Number(frame),
              line: Number(line),
              record: null,
            });
          }
        }
      }
      await sleep(60);
    }
    const placements = samples.flatMap((sample) => sample.placements);
    trace.encounters.push({ label: encounters[index], rows: [...seen.values()], placements, samples });
    console.log(`  trace ${encounters[index]}: ${seen.size} rows, ${placements.length} placements`);
  }
  writeFileSync(path.join(out, "page-trace.json"), JSON.stringify(trace, null, 2));

  writeFileSync(
    path.join(out, "page-check.json"),
    JSON.stringify({ chrome: version.Browser, page: pageState, items: pageItems, console: initial.console, failures: initial.failures }, null, 2),
  );

  console.log(
    JSON.stringify(
      {
        selectionProbes: probe.selection.length,
        renderCases: probe.renderCases.length,
        clipShots: shots.length,
        cellShots: cellShots.length,
        harnessConsole: harness.console.length,
        harnessFailures: harness.failures.length,
        pageMonsterViewports: pageItems.length,
        pageBrokenImages: pageState.brokenImages.length,
        pageConsole: initial.console.length,
        pageFailures: initial.failures,
      },
      null,
      2,
    ),
  );

  await cdp.send("Browser.close").catch(() => {});
  child.kill();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
