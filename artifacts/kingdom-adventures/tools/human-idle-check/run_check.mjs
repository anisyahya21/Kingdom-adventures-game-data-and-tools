/**
 * Driver for the frozen human battle idle (PASS 12 / 12.36).
 *
 * Measures the real /battle-replay page with the animation and beat clocks frozen, reads back every
 * drawn SEB line of both human allies from the DOM (line, resource group, image index, sheet file,
 * crop, OPT cell/source/destination, SEB translation) and screenshots the stage plus a zoom of each
 * ally. The companion verify.py recomputes every expectation from the original SEB and the baked
 * img.inf/OPT data - this driver only records.
 *
 * Usage: node run_check.mjs --base http://127.0.0.1:5173 --out <evidence dir>
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

/** Freeze both page clocks (native animation 50 ms, replay beat 1100 ms) before app code runs. */
const CLOCK_FREEZE = `(() => {
  const nativeSetInterval = window.setInterval.bind(window);
  window.setInterval = function (fn, ms, ...rest) {
    if (ms === 50 || ms === 1100) return 0;
    return nativeSetInterval(fn, ms, ...rest);
  };
})()`;

/**
 * Isolate one ally's human layers for the pixel comparison: hide the arena backdrop and every other
 * direct child of the scene. This is a measurement fixture only - the human markup itself is
 * untouched, so what remains on screen is exactly what the page painted for that unit.
 */
const SOLO = (allyId) => `(() => {
  const scene = document.querySelector('div[style*="background-image"]');
  if (!scene) return null;
  const entrySelector = '[data-battle-sprite-entry]';
  const own = Array.from(scene.querySelectorAll(entrySelector)).filter((entry) =>
    entry.querySelector('[data-human-idle="${allyId}"]'),
  );
  const target = own[0];
  if (!target) return null;
  /*
   * PASS 14: the ally's lines are single entries inside the shared depth layer, so the other units
   * are hidden entry by entry instead of hiding the layer (which now holds every unit's lines).
   */
  let hiddenEntries = 0;
  scene.style.backgroundImage = 'none';
  for (const child of Array.from(scene.children)) {
    if (!child.hasAttribute('data-battle-sprite-layer')) {
      child.style.display = 'none';
      continue;
    }
    for (const entry of Array.from(child.querySelectorAll(entrySelector))) {
      if (!own.includes(entry)) {
        entry.style.display = 'none';
        hiddenEntries += 1;
      }
    }
  }
  const rect = scene.getBoundingClientRect();
  const scaleX = rect.width / Number(scene.dataset.sceneWidth || 481);
  const scaleY = rect.height / Number(scene.dataset.sceneHeight || 197);
  const rootRect = target.getBoundingClientRect();
  return {
    sceneRect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    scaleX,
    scaleY,
    origin: { x: (rootRect.x - rect.x) / scaleX, y: (rootRect.y - rect.y) / scaleY },
    hidden: scene.children.length - 1 + hiddenEntries,
    ownEntries: own.length,
  };
})()`;

/**
 * Read every human layer of the stage.
 *
 * Logical units are 1 scene px per native px: the scene keeps its 481x197 logical box and the shared
 * presentation transform scales X and Y separately (native 196/192), so both axes are divided by
 * their own measured scale.
 */
/**
 * One attack-pass sample: the clip/frame/window state of both allies plus every line of the acting
 * ally, read from the same DOM the frozen pass measures.
 */
const ATTACK_SAMPLE = `(() => {
  const scene = document.querySelector('div[style*="background-image"]');
  const rect = scene?.getBoundingClientRect();
  const sceneRect = scene?.getBoundingClientRect();
  const scaleX = sceneRect ? sceneRect.width / Number(scene.dataset.sceneWidth || 481) : 1;
  const scaleY = sceneRect ? sceneRect.height / Number(scene.dataset.sceneHeight || 197) : 1;
  const human = (id) => Array.from(document.querySelectorAll('[data-human-idle="' + id + '"]')).map((wrap) => {
    const entry = wrap.closest('[data-battle-sprite-entry]');
    const line = wrap.querySelector('[data-human-line]');
    const entryRect = entry?.getBoundingClientRect();
    return {
      line: Number(entry?.getAttribute('data-line-index')),
      depth: Number(entry?.getAttribute('data-depth')),
      baseDepth: Number(entry?.getAttribute('data-base-depth')),
      cell: entry?.getAttribute('data-cell'),
      livePosition: entry?.getAttribute('data-live-position'),
      worldPosition: entry?.getAttribute('data-world-position'),
      logicalOrigin: entryRect && sceneRect
        ? {
            x: +((entryRect.x - sceneRect.x) / scaleX).toFixed(3),
            y: +((entryRect.y - sceneRect.y) / scaleY).toFixed(3),
          }
        : null,
      res: line?.getAttribute('data-human-res'),
      part: line?.getAttribute('data-human-part'),
      slot: line?.getAttribute('data-human-slot'),
      tex: line?.getAttribute('data-human-tex'),
      file: line?.getAttribute('data-human-file'),
      crop: line?.getAttribute('data-human-crop'),
      optCell: line?.getAttribute('data-human-opt-cell'),
      trans: line?.getAttribute('data-human-trans'),
    };
  }).sort((a, b) => a.line - b.line);
  const head = (id) => {
    const wrap = document.querySelector('[data-human-idle="' + id + '"]');
    if (!wrap) return null;
    return {
      id,
      clip: wrap.getAttribute('data-human-clip'),
      seb: wrap.getAttribute('data-human-seb'),
      phase: wrap.getAttribute('data-human-phase'),
      frame: Number(wrap.getAttribute('data-human-frame')),
      attackUpdate: wrap.getAttribute('data-attack-update'),
      nativeHitUpdate: wrap.getAttribute('data-native-hit-update'),
      nativeAttackWindow: wrap.getAttribute('data-native-attack-window'),
      nativeDamageWindow: wrap.getAttribute('data-native-damage-window'),
      nativeKnockdownDownAt: wrap.getAttribute('data-native-knockdown-down-at'),
      nativeKnockdownLeavingAt: wrap.getAttribute('data-native-knockdown-leaving-at'),
      nativeState: wrap.getAttribute('data-human-native-state'),
      reaction: wrap.getAttribute('data-human-reaction'),
      reactionUpdate: wrap.getAttribute('data-human-reaction-update'),
      knockdownUpdate: wrap.getAttribute('data-human-knockdown-update'),
      direction: wrap.getAttribute('data-human-direction'),
      flip: wrap.getAttribute('data-human-flip'),
      behaviour: wrap.getAttribute('data-human-behaviour'),
      damageLift: wrap.getAttribute('data-human-damage-lift'),
      leaving: wrap.getAttribute('data-human-leaving'),
      leavingUpdate: wrap.getAttribute('data-human-leaving-update'),
      projectileFrame: wrap.getAttribute('data-human-projectile-frame'),
      projectileMaxFrame: wrap.getAttribute('data-human-projectile-max-frame'),
      worldX: wrap.getAttribute('data-human-world-x'),
      worldY: wrap.getAttribute('data-human-world-y'),
      worldZ: wrap.getAttribute('data-human-world-z'),
      rivalTeamMemberCount: wrap.getAttribute('data-human-rival-team-member-count'),
      leavingFrame: wrap.getAttribute('data-human-leaving-frame'),
      leavingUpdates: wrap.getAttribute('data-human-leaving-updates'),
      leavingImpacted: wrap.getAttribute('data-human-leaving-impacted'),
      leavingHeight: wrap.getAttribute('data-human-leaving-height'),
      leavingStart: wrap.getAttribute('data-human-leaving-start'),
      leavingEnd: wrap.getAttribute('data-human-leaving-end'),
      leavingWorld: wrap.getAttribute('data-human-leaving-world'),
      revivalState: wrap.getAttribute('data-human-revival-state'),
      moveFrame: wrap.getAttribute('data-human-move-frame'),
      moveTargetX: wrap.getAttribute('data-human-move-target-x'),
      moveTargetZ: wrap.getAttribute('data-human-move-target-z'),
      moveTargetCell: wrap.getAttribute('data-human-move-target-cell'),
      nativeLeavingKind: wrap.getAttribute('data-native-leaving-kind'),
      nativeLeavingMinHeight: wrap.getAttribute('data-native-leaving-min-height'),
      nativeLeavingMaxHeight: wrap.getAttribute('data-native-leaving-max-height'),
      draws: Number(wrap.getAttribute('data-human-draws')),
      skipped: Number(wrap.getAttribute('data-human-skipped')),
    };
  };
  return {
    event: document.body.innerText.match(/event\\s+(\\d+)\\s*\\/\\s*(\\d+)/)?.[0] ?? null,
    rowOffset: Number(scene?.getAttribute('data-row-offset') ?? 'NaN'),
    scene: rect ? { rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } } : null,
    guard: head('guard-d'),
    archer: head('archer-c'),
    guardLines: human('guard-d'),
    archerLines: human('archer-c'),
  };
})()`;

const CAPTURE = `(() => {
  const rr = (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(3), y: +r.y.toFixed(3), w: +r.width.toFixed(3), h: +r.height.toFixed(3) }; };
  const scene = document.querySelector('div[style*="background-image"]');
  if (!scene) return null;
  const sceneRect = scene.getBoundingClientRect();
  const scaleX = sceneRect.width / Number(scene.dataset.sceneWidth || 481);
  const scaleY = sceneRect.height / Number(scene.dataset.sceneHeight || 197);
  const logical = (rect) => ({
    x: +((rect.x - sceneRect.x) / scaleX).toFixed(3),
    y: +((rect.y - sceneRect.y) / scaleY).toFixed(3),
  });
  const logicalSize = (rect) => ({ w: +(rect.w / scaleX).toFixed(3), h: +(rect.h / scaleY).toFixed(3) });
  const sceneFacts = {
    logicalViewWidth: Number(scene.dataset.logicalViewWidth || 0),
    sourceHeight: Number(scene.dataset.logicalSourceHeight || 0),
    verticalRatio: Number(scene.dataset.verticalRatio ?? 'NaN'),
    backgroundX: Number(scene.dataset.backgroundX ?? 'NaN'),
    rowOffset: Number(scene.dataset.rowOffset ?? 'NaN'),
    leavingFixtures: scene.dataset.humanLeavingFixtures
      ? JSON.parse(scene.dataset.humanLeavingFixtures)
      : null,
    revivalFixtures: scene.dataset.humanRevivalFixtures
      ? JSON.parse(scene.dataset.humanRevivalFixtures)
      : null,
    viewProfile: scene.dataset.viewProfile || null,
  };

  const allies = [];
  /*
   * PASS 14: the human lines live in the shared per-line depth layer, so each drawn line is its own
   * [data-battle-sprite-entry] box (at the unit's origin) holding a [data-human-idle] container with
   * exactly one [data-human-line] inside. The measurement is unchanged: group the containers by
   * character id (DOM order, which is ascending line order within one unit) and measure each line
   * against the scene exactly as before.
   */
  const allyIndex = new Map();
  for (const container of scene.querySelectorAll('[data-human-idle]')) {
    const root = container.closest('[data-battle-sprite-entry]') ?? container.parentElement?.parentElement ?? container;
    const debugEl = Array.from((root.parentElement ?? root).querySelectorAll('span')).find((el) => (el.textContent || '').startsWith('#'));
    const layers = [];
    for (const cell of container.querySelectorAll('[data-human-line]')) {
      const clip = cell.querySelector('div');
      const img = clip ? clip.querySelector('img') : null;
      const cellRect = rr(cell);
      const clipRect = clip ? rr(clip) : null;
      layers.push({
        line: Number(cell.dataset.humanLine),
        part: cell.dataset.humanPart,
        res: Number(cell.dataset.humanRes),
        slot: Number(cell.dataset.humanSlot),
        tex: Number(cell.dataset.humanTex),
        dir: cell.dataset.humanDir,
        file: cell.dataset.humanFile,
        trans: cell.dataset.humanTrans,
        crop: cell.dataset.humanCrop,
        optCell: cell.dataset.humanOptCell,
        optDest: clip ? clip.dataset.humanOptDest : null,
        optSrc: clip ? clip.dataset.humanOptSrc : null,
        cellLogicalOrigin: logical(cellRect),
        cellLogicalSize: logicalSize(cellRect),
        clipLogicalOrigin: clipRect ? logical(clipRect) : null,
        clipLogicalSize: clipRect ? logicalSize(clipRect) : null,
        domCellSize: { w: cell.style.width, h: cell.style.height },
        domCellLeft: cell.style.left,
        domCellTop: cell.style.top,
        domClipLeft: clip ? clip.style.left : null,
        domClipTop: clip ? clip.style.top : null,
        domClipWidth: clip ? clip.style.width : null,
        domClipHeight: clip ? clip.style.height : null,
        domImgLeft: img ? img.style.left : null,
        domImgTop: img ? img.style.top : null,
        imgSrc: img ? new URL(img.src).pathname : null,
        imgNatural: img ? [img.naturalWidth, img.naturalHeight] : null,
        imgComplete: img ? img.complete : null,
      });
    }
    const id = container.dataset.humanIdle;
    const existing = allyIndex.get(id);
    if (existing) {
      existing.layers.push(...layers);
      continue;
    }
    const record = {
      id,
      draws: Number(container.dataset.humanDraws),
      skipped: Number(container.dataset.humanSkipped),
      debug: debugEl ? debugEl.textContent : null,
      entityOrigin: logical(rr(root)),
      entityOriginPx: rr(root),
      containerDataset: { ...container.dataset },
      layers,
    };
    allyIndex.set(id, record);
    allies.push(record);
  }
  return {
    scene: {
      rect: rr(scene),
      scaleX: +scaleX.toFixed(6),
      scaleY: +scaleY.toFixed(6),
      logical: [Number(scene.dataset.sceneWidth), Number(scene.dataset.sceneHeight)],
      transform: getComputedStyle(scene).transform,
      facts: sceneFacts,
    },
    /**
     * Which surface the page is showing. Recovered Replay (the default) must expose no override at
     * all: no toggle grid, no view-profile picker, no encounter picker.
     */
    surface: {
      recoveredCard: Boolean(document.querySelector('[data-recovered-replay]')),
      encounterId: document.querySelector('[data-recovered-encounter]')?.dataset.recoveredEncounter ?? null,
      switches: document.querySelectorAll('button[role="switch"]').length,
      profileOptions: document.querySelectorAll('[data-view-profile-option]').length,
      labBadge: Array.from(document.querySelectorAll('*')).some((el) => el.children.length === 0 && (el.textContent || '').trim() === 'lab surface'),
      overlayNotice: Boolean(document.querySelector('[data-recovered-overlay-notice]')),
      /**
       * Placeholder overlays and HUD sprites inside the stage: damage numbers, combat text,
       * effects, arrows, the skill balloon and the asset-only HUD bars/item slots. Recovered
       * Replay must draw none of them (the BOSS banner, which both recordings show, is excluded).
       */
      unsupportedOverlays: Array.from(scene.querySelectorAll('img')).filter((img) => {
        const src = img.getAttribute('src') || '';
        if (/\\/battle-assets\\/(numbers|text|effects|indicators)\\//.test(src)) return true;
        return /(member_info_bar|treasure_bar|command_bar|item_slot_mini|bubble)\\.png$/.test(src);
      }).length,
    },
    allies,
    legacyHumanLayers: Array.from(scene.querySelectorAll('span')).filter((el) => (getComputedStyle(el).backgroundImage || 'none') !== 'none').length,
    canvases: scene.querySelectorAll('canvas').length,
  };
})()`;

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = { base: "http://127.0.0.1:5173", out: null, port: 9337 };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    const value = argv[i + 1];
    if (key === "port") out[key] = Number(value);
    else out[key] = value;
  }
  if (!out.out) throw new Error("--out is required");
  return out;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Kept at module scope so a failed run can always tear the browser down (see the exit handler). */
let chromeChild = null;

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

async function main() {
  const args = parseArgs();
  const out = path.resolve(args.out);
  const shotsDir = path.join(out, "shots");
  mkdirSync(shotsDir, { recursive: true });

  const binary = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!binary) throw new Error("no Chrome/Edge binary found");
  const profile = mkdtempSync(path.join(tmpdir(), "ka-human-idle-"));
  const child = spawn(
    binary,
    [
      "--headless=new",
      `--remote-debugging-port=${args.port}`,
      `--user-data-dir=${profile}`,
      "--window-size=1500,1000",
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
  chromeChild = child;

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
  const console_ = [];
  const failures = [];
  cdp.on((message) => {
    if (message.method === "Runtime.exceptionThrown") {
      console_.push({
        type: "exception",
        text: message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text,
      });
    }
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) {
      console_.push({ type: message.params.type, text: message.params.args.map((a) => a.value ?? a.description ?? a.type).join(" ") });
    }
    if (message.method === "Network.responseReceived" && message.params.response.status >= 400) {
      failures.push({ url: message.params.response.url, status: message.params.response.status });
    }
  });

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
  const shoot = async (rect, file, scale = 1) => {
    const capture = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: rect.x, y: rect.y, width: Math.round(rect.w), height: Math.round(rect.h), scale },
    });
    writeFileSync(file, Buffer.from(capture.data, "base64"));
  };
  const setSwitch = async (label, on) => {
    const result = await evaluate(`(() => {
      const switches = Array.from(document.querySelectorAll('button[role="switch"]'));
      const index = switches.findIndex((el) => (el.closest("div")?.textContent ?? "").includes(${JSON.stringify(label)}));
      if (index < 0) return null;
      const current = switches[index].getAttribute("aria-checked") === "true";
      if (current !== ${on}) switches[index].click();
      return { index, was: current, now: switches[index].getAttribute("aria-checked") };
    })()`);
    await sleep(350);
    return result;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Network.enable");
  const freezeScript = await send("Page.addScriptToEvaluateOnNewDocument", { source: CLOCK_FREEZE });
  await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });

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
    await sleep(500);
  };

  /** Click a replay control by its visible label. Returns false when the button is absent. */
  const clickButton = async (label) => evaluate(`(() => {
    const button = Array.from(document.querySelectorAll("button"))
      .find((el) => el.textContent.trim() === ${JSON.stringify(label)});
    if (!button) return false;
    button.click();
    return true;
  })()`);

  /**
   * Click a replay control and sample the DOM across the resulting animation window *inside the page*.
   *
   * The accessibility/evaluate round trip carries a settle delay, so sampling from Node would miss the
   * start of a 7-update (350 ms) reaction. Running the loop in the page starts the first sample in the
   * same task as the click.
   */
  const clickAndSample = (label, count, intervalMs) => evaluate(`(async () => {
    const button = Array.from(document.querySelectorAll("button"))
      .find((el) => el.textContent.trim() === ${JSON.stringify(label)});
    if (!button) return null;
    button.click();
    const out = [];
    for (let i = 0; i < ${count}; i += 1) {
      out.push(${ATTACK_SAMPLE});
      await new Promise((resolve) => setTimeout(resolve, ${intervalMs}));
    }
    return out;
  })()`);

  /**
   * Click `Next` several times and immediately sample the rendered state after the last click. The
   * short inter-click delay lets React commit each state change without giving the 50 ms native
   * animation clock time to advance out of the intended start state.
   */
  const clickManyAndSample = (clicks, count, intervalMs) => evaluate(`(async () => {
    for (let i = 0; i < ${clicks}; i += 1) {
      const button = Array.from(document.querySelectorAll("button"))
        .find((el) => el.textContent.trim() === "Next");
      if (button) button.click();
      await new Promise((resolve) => setTimeout(resolve, 12));
    }
    const out = [];
    for (let i = 0; i < ${count}; i += 1) {
      out.push(${ATTACK_SAMPLE});
      await new Promise((resolve) => setTimeout(resolve, ${intervalMs}));
    }
    return out;
  })()`);

  /**
   * Put the replay on the step the frozen-idle assertions describe.
   *
   * PASS 15 COMMAND 15.2 makes the human allies animate: the unit whose event is the current attack
   * plays its weapon's attack clip for the recovered 20-update window instead of the frozen
   * EQUIP_WAIT frame. The frozen surface therefore has to be captured on a step where neither ally
   * is the attacker - step 0 (the enemy's opening attack) is exactly that, and it leaves both allies
   * on EQUIP_WAIT. This does not weaken the frame-0 assertions: they still have to hold, on the state
   * they were always about.
   */
  const resetToIdleStep = async () => {
    await clickButton("Pause");
    await clickButton("Reset");
    await sleep(220);
    /*
     * The lab surface does not open on the locked encounter, and its own first steps can be ally
     * attack events. Advance until neither ally is playing an attack clip, so every "frozen" surface
     * really is showing the idle state the frame-0 assertions are about.
     */
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const snapshot = await evaluate(`(() => ({
      event: document.body.innerText.match(/event\\s+(\\d+)\\s*\\/\\s*(\\d+)/)?.[0] ?? null,
      clips: Array.from(document.querySelectorAll("[data-human-idle]")).map((el) => [
        el.getAttribute("data-human-idle"), el.getAttribute("data-human-clip"), el.getAttribute("data-human-frame"),
      ]),
      }))()`);
      /*
       * A PASS 15 COMMAND 15.5 reaction state has no `data-human-clip` at all (its clip is a reaction
       * clip, not a `HumanClip`), so "not idle" has to be tested against the attribute being exactly
       * EQUIP_WAIT rather than against a truthy value.
       */
      const attacking = (snapshot?.clips ?? []).some(([, clip]) => clip !== "equipWaitUp");
      if (!attacking) return snapshot;
      await clickButton("Next");
      await sleep(220);
    }
    return evaluate(`(() => ({ event: null, clips: [] }))()`);
  };

  /*
   * Default page first: this is the shipped Recovered Replay mode (encounter and presentation
   * locked, no override). The switch-driven parts below run on the lab surface (`?lab=1`).
   */
  await goto(`${args.base}/battle-replay`);
  await evaluate(`(async () => {
    for (let i = 0; i < 200; i += 1) {
      const images = Array.from(document.images);
      if (images.length > 0 && images.every((img) => img.complete)) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  })()`);
  await sleep(900);

  const idleStep = await resetToIdleStep();

  /* Recovered Replay default: the audited state */
  const frozen = await evaluate(CAPTURE);
  const stageRect = frozen?.scene?.rect;
  if (stageRect) await shoot(stageRect, path.join(out, "stage-frozen-human-idle.png"));

  /* the lab surface: same renderer, plus the experimental switches the comparison captures need */
  await goto(`${args.base}/battle-replay?lab=1`);
  await evaluate(`(async () => {
    for (let i = 0; i < 200; i += 1) {
      const images = Array.from(document.images);
      if (images.length > 0 && images.every((img) => img.complete)) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  })()`);
  await sleep(900);
  await resetToIdleStep();
  const lab = await evaluate(CAPTURE);

  /* labels on, so the capture carries the unit identity, then off again */
  await setSwitch("Unit name / cell labels", true);
  const labelled = await evaluate(CAPTURE);
  await setSwitch("Unit name / cell labels", false);

  /* zooms around each ally, frozen path */
  const zooms = {};
  const zoomRect = (ally) => ({
    x: frozen.scene.rect.x + (ally.entityOrigin.x - 40) * frozen.scene.scaleX,
    y: frozen.scene.rect.y + (ally.entityOrigin.y - 46) * frozen.scene.scaleY,
    w: 80 * frozen.scene.scaleX,
    h: 60 * frozen.scene.scaleY,
  });
  for (const ally of frozen?.allies ?? []) {
    const file = `shots/zoom-${ally.id}.png`;
    await shoot(zoomRect(ally), path.join(out, file), 4);
    zooms[ally.id] = file;
  }

  /*
   * Solo captures: arena and every other unit hidden, so the screenshot contains only that ally's
   * human layers and verify.py can compare the painted pixels with the independent composition.
   * The page is reloaded afterwards, which is also what restores the hidden siblings.
   */
  const solo = {};
  for (const ally of frozen?.allies ?? []) {
    const info = await evaluate(SOLO(ally.id));
    if (!info) continue;
    await sleep(250);
    const rect = {
      x: info.sceneRect.x + (info.origin.x - 40) * info.scaleX,
      y: info.sceneRect.y + (info.origin.y - 46) * info.scaleY,
      w: 80 * info.scaleX,
      h: 60 * info.scaleY,
    };
    const file = `shots/solo-${ally.id}.png`;
    await shoot(rect, path.join(out, file), 1);
    solo[ally.id] = {
      ...info,
      captureOriginLogical: { x: info.origin.x - 40, y: info.origin.y - 46 },
      captureLogical: { w: 80, h: 60 },
      file,
    };
    await goto(`${args.base}/battle-replay?lab=1`);
    await sleep(900);
  }

  /* comparison: the previous human renderers on the same frozen frame */
  const legacyOff = await evaluate(`(() => {
    const switches = Array.from(document.querySelectorAll('button[role="switch"]'));
    const row = switches.find((el) => (el.closest("div")?.textContent ?? "").includes("Frozen human idle"));
    if (!row) return null;
    const was = row.getAttribute("aria-checked");
    if (was === "true") row.click();
    return { was, now: row.getAttribute("aria-checked") };
  })()`);
  await sleep(900);
  const legacy = await evaluate(CAPTURE);
  if (stageRect) await shoot(stageRect, path.join(out, "stage-legacy-humans.png"));
  /* the legacy renderers have no data-human-idle container, so the frozen origins are reused */
  for (const ally of frozen?.allies ?? []) {
    await shoot(zoomRect(ally), path.join(out, `shots/zoom-legacy-${ally.id}.png`), 4);
  }

  /*
   * PASS 15 COMMAND 15.2 attack pass.
   *
   * The attack visual cannot be observed with the clocks frozen: it is driven by the native update
   * clock (`AnimationSystem.Update` runs once per rendered frame) and lasts the recovered 20-update
   * window, so the freeze script comes off, the page is reloaded, the beat clock is paused and the
   * replay is stepped onto the ally's own attack event. `?lab=1` is not needed - the locked
   * Recovered Replay already contains the event.
   */
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: freezeScript.identifier });
  await goto(`${args.base}/battle-replay`);
  await sleep(1100);
  /*
   * Step deterministically: the page opens on the locked timeline's first event, so pause, reset to
   * it, and take one step onto the ally's own attack event. This no longer depends on which step the
   * idle reset happens to stop on.
   */
  await clickButton("Pause");
  await clickButton("Reset");
  await sleep(250);
  const attackIdle = await evaluate(ATTACK_SAMPLE);
  /* ~20 ms in-page sampling against the 50 ms native update covers the whole 20-update window */
  const attackSamples = await clickAndSample("Next", 70, 20);
  const stepped = attackSamples !== null;
  const attack = attackSamples ?? [];
  const attackRect = attack[0]?.scene?.rect;
  if (attackRect) await shoot(attackRect, path.join(out, "stage-guard-attack.png"));

  /*
   * PASS 15 COMMAND 15.5 damage-reaction pass.
   *
   * The reaction fires once, on the update its hit event becomes current, so sitting on the event
   * shows nothing after the first 7 updates. Step away (which clears the reaction) and back, then
   * sample across the 350 ms window.
   */
  await clickButton("Pause");
  await clickButton("Reset");
  await sleep(250);
  await clickButton("Next");
  await sleep(300);
  const reactionIdle = await evaluate(ATTACK_SAMPLE);
  /* the 7-update reaction is only 350 ms long: sample it in-page from the click */
  const reaction = (await clickAndSample("Prev", 20, 20)) ?? [];
  const reactionRect = reaction[0]?.scene?.rect;
  if (reactionRect) await shoot(reactionRect, path.join(out, "stage-guard-damage.png"));

  /*
   * PASS 15 COMMAND 15.9 leaving pass.
   *
   * The locked Wairo Tank timeline has no KO, so use the lab surface's Kairobot Knight encounter
   * (its sixth event is the lethal hit on Guard D). Pause the beat clock on that KO event and sample
   * the real animation clock across the whole lethal chain: 7 damage updates + 101 knock-down updates
   * + the 10-ish kind-10 projectile updates. The sample loop stops as soon as the leaving phase is
   * observed, then the stage is captured while the unit is still on screen.
   */
  await goto(`${args.base}/battle-replay?lab=1`);
  await sleep(900);
  const encounterSelected = await evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('button'))
      .find((el) => (el.textContent || '').includes('Kairobot Knight'));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  await sleep(700);
  await clickButton("Pause");
  await clickButton("Reset");
  await sleep(220);
  for (let i = 0; i < 5; i += 1) {
    await clickButton("Next");
    await sleep(140);
  }
  await sleep(180);
  const leavingStartSample = await evaluate(ATTACK_SAMPLE);
  const leavingSamples = await evaluate(`(async () => {
    const out = [];
    for (let i = 0; i < 360; i += 1) {
      out.push(${ATTACK_SAMPLE});
      const seen = out.filter((sample) => (sample.guard || {}).nativeState === 'leaving').length;
      if (seen >= 40) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return out;
  })()`);
  const leavingFirst = (leavingSamples ?? []).find(
    (sample) => (sample.guard || {}).nativeState === "leaving",
  );
  const leavingRect = leavingFirst?.scene?.rect;
  if (leavingRect) await shoot(leavingRect, path.join(out, "stage-guard-leaving.png"));

  /*
   * PASS 15 COMMAND 15.11 revival passes.
   *
   * Reset to the Kairobot Knight KO, wait the requested number of native updates while paused on
   * event 6, then step to event 10/10 (the revive on Guard D). The four scenarios deliberately
   * interrupt damage, knock-down, static down and active Leaving.
   */
  const resetToKoEvent = async () => {
    await clickButton("Reset");
    await sleep(180);
    for (let i = 0; i < 5; i += 1) {
      await clickButton("Next");
      await sleep(12);
    }
  };
  const runRevivalScenario = async (waitMs) => {
    await resetToKoEvent();
    await sleep(waitMs);
    const pre = await evaluate(ATTACK_SAMPLE);
    const samples = (await clickManyAndSample(4, 140, 20)) ?? [];
    return { pre, samples };
  };
  const revivalDamage = await runRevivalScenario(0);
  const revivalKnockdown = await runRevivalScenario(600);
  const revivalDown = await runRevivalScenario(1400);
  const revivalLeaving = await runRevivalScenario(5600);
  for (const [label, scenario] of [
    ["damage", revivalDamage],
    ["knockdown", revivalKnockdown],
    ["down", revivalDown],
    ["leaving", revivalLeaving],
  ]) {
    const first = (scenario.samples ?? []).find(
      (sample) =>
        (sample.guard || {}).nativeState === "revival-moving" ||
        (sample.guard || {}).revivalState === "unsupported-during-leaving",
    );
    const rect = first?.scene?.rect;
    if (rect) await shoot(rect, path.join(out, `stage-guard-revival-${label}.png`));
  }

  writeFileSync(
    path.join(out, "human-idle.json"),
    JSON.stringify(
      {
        chrome: version.Browser,
        base: args.base,
        frozen,
        idleStep,
        lab,
        labelled,
        legacySwitch: legacyOff,
        legacy,
        zooms,
        solo,
        attack: { idle: attackIdle, stepped, samples: attack },
        reaction: { idle: reactionIdle, samples: reaction },
        leaving: {
          encounterSelected,
          start: leavingStartSample,
          samples: leavingSamples,
        },
        revival: {
          damage: revivalDamage,
          knockdown: revivalKnockdown,
          down: revivalDown,
          leaving: revivalLeaving,
        },
        console: console_,
        failures,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({
    frozenAllies: (frozen?.allies ?? []).map((a) => ({ id: a.id, draws: a.draws, skipped: a.skipped, origin: a.entityOrigin })),
    legacyLayers: legacy?.legacyHumanLayers,
    leavingSamples: (leavingSamples ?? []).length,
    leavingObserved: (leavingSamples ?? []).some(
      (sample) => (sample.guard || {}).nativeState === "leaving",
    ),
    console: console_.length,
    failures: failures.length,
  }, null, 1));

  await cdp.send("Browser.close").catch(() => {});
  child.kill();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  /* never leave the spawned browser (and its open CDP socket) holding the harness open */
  chromeChild?.kill();
  setTimeout(() => process.exit(1), 100);
});
