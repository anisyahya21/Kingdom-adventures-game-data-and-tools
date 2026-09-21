/**
 * Generated replay browser harness - real stored replay, deterministic DOM checks.
 *
 * Seeds `sessionStorage["ka-generated-battle-1"]` with the real R.json / RL.json replay written by
 * the authoritative Python runner, opens `/battle-replay?mode=generated` and reads the production
 * DOM. It checks the authoritative tick clock (one frame per tick, exact +1 advance, scrub lands on
 * the exact tick, the clock stops on the final frame), that the unit rows/stage carry the replay's
 * own cells and event-folded HP/state, that status/death/leaving follow the event state, that the
 * recovered action events are explained, and that no demo `humanIdleCharacterForUnit` identity
 * (guard-d / archer-c) is ever drawn for a real team unit.
 *
 * Usage: node tools/generated-replay-check/run_check.mjs --base http://127.0.0.1:5173 --out <dir>
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..", "..");
const WORKSPACE = path.resolve(APP, "..", "..", "..");
const REPLAYS = path.join(WORKSPACE, "RE-evidence", "20260919-configurable-battle-setup", "run-battle-16.4", "replays");

/** Freeze the recovered 50 ms battle clock (speed 1x) so step/scrub are deterministic. */
const CLOCK_FREEZE = `(() => {
  const nativeSetInterval = window.setInterval.bind(window);
  window.setInterval = function (fn, ms, ...rest) {
    if (ms === 50) return 0;
    return nativeSetInterval(fn, ms, ...rest);
  };
})()`;

const READ = `(() => {
  const root = document.querySelector('[data-generated-replay="loaded"]');
  if (!root) {
    return { status: (document.querySelector('[data-generated-replay]') || {}).dataset ?
      document.querySelector('[data-generated-replay]').dataset.generatedReplay : "missing",
      body: document.body.innerText.slice(0, 3000) };
  }
  const d = root.dataset;
  const num = (key) => (d[key] === undefined ? null : Number(d[key]));
  const units = Array.from(document.querySelectorAll('[data-generated-unit]')).map((el) => ({
    id: el.dataset.generatedUnit,
    side: el.dataset.generatedUnitSide,
    kind: el.dataset.generatedUnitKind,
    cell: el.dataset.generatedUnitCell,
    hp: Number(el.dataset.generatedUnitHp),
    maxHp: Number(el.dataset.generatedUnitMaxHp),
    state: Number(el.dataset.generatedUnitState),
    visual: el.dataset.generatedUnitVisual,
    dead: el.dataset.generatedUnitDead === "1",
    leaving: el.dataset.generatedUnitLeaving === "1",
    clip: el.dataset.generatedUnitClip || null,
    status: el.dataset.generatedUnitStatus || "",
  }));
  const stage = Array.from(document.querySelectorAll('[data-unit-root]')).map((el, index) => ({
    domIndex: index,
    id: el.dataset.generatedUnitId === undefined ? null : el.dataset.generatedUnitId,
    side: el.dataset.side,
    depth: el.dataset.generatedDepth === undefined ? null : Number(el.dataset.generatedDepth),
    cell: el.dataset.generatedCell === undefined ? null : el.dataset.generatedCell,
    visual: el.dataset.generatedVisual === undefined ? null : el.dataset.generatedVisual,
    generic: el.dataset.genericAvatar === undefined ? null : el.dataset.genericAvatar,
    humanIdle: el.querySelector('[data-human-idle]') ? el.querySelector('[data-human-idle]').dataset.humanIdle : null,
    monsterAlt: el.querySelector('img[alt]') ? el.querySelector('img[alt]').getAttribute('alt') : null,
  }));
  const speedEl = document.querySelector('[data-generated-speed]');
  return {
    status: d.generatedReplay,
    encounter: d.generatedEncounter,
    frameIndex: num("generatedFrame"),
    tick: num("generatedTick"),
    frameCount: num("generatedFrameCount"),
    minTick: num("generatedMinTick"),
    maxTick: num("generatedMaxTick"),
    intervalMs: num("generatedIntervalMs"),
    playing: d.generatedPlaying === "1",
    speed: speedEl ? Number(speedEl.dataset.generatedSpeed) : null,
    units,
    stage,
    explanations: Array.from(document.querySelectorAll('[data-generated-event-explanations] > div')).map((el) => el.dataset.eventExplanation),
    explanationsText: (document.querySelector('[data-generated-event-explanations]') || {}).textContent || "",
    finishPresence: (document.querySelector('[data-generated-final-totals]') || {}).dataset ?
      document.querySelector('[data-generated-final-totals]').dataset.generatedFinish : null,
    inventory: (document.querySelector('[data-generated-inventory]') || {}).textContent || null,
    fallbackText: (document.querySelector('[data-generated-stage-fallback]') || {}).textContent || "",
    genericAvatars: document.querySelectorAll('[data-generic-avatar]').length,
    demoHumanIdle: Array.from(document.querySelectorAll('[data-human-idle]')).map((el) => el.dataset.humanIdle),
    probe: null,
  };
})()`;

/**
 * Independent visibility measurement for the mounted stage.
 *
 * Nothing here re-uses the page's own placement math: every fighter is measured from the real
 * client rects of the elements it drew (the entity-origin box plus every descendant box), and the
 * viewport is the mounted stage window. `intersects` is the actual question the visual review asked
 * ("can a viewer see this fighter?"), `originInside` is the stricter camera statement.
 */
const MEASURE = `(() => {
  const win = document.querySelector('[data-view-window="profile"]');
  if (!win) return { error: "no stage window mounted" };
  const w = win.getBoundingClientRect();
  const round = (value) => Math.round(value * 10) / 10;
  const entries = Array.from(document.querySelectorAll('[data-unit-root]')).map((root) => {
    const rects = [root, ...root.querySelectorAll('*')]
      .map((el) => el.getBoundingClientRect())
      .filter((rect) => rect.width > 0.5 && rect.height > 0.5);
    const own = root.getBoundingClientRect();
    const box = rects.length
      ? {
          left: Math.min(...rects.map((rect) => rect.left)),
          right: Math.max(...rects.map((rect) => rect.right)),
          top: Math.min(...rects.map((rect) => rect.top)),
          bottom: Math.max(...rects.map((rect) => rect.bottom)),
        }
      : null;
    return {
      id: root.dataset.generatedUnitId || null,
      side: root.dataset.side || null,
      visual: root.dataset.generatedVisual || null,
      placeholder: root.dataset.genericAvatar === undefined ? null : root.dataset.genericAvatar,
      art: Boolean(root.querySelector('img')),
      box: box
        ? { left: round(box.left), right: round(box.right), top: round(box.top), bottom: round(box.bottom),
            width: round(box.right - box.left), height: round(box.bottom - box.top) }
        : null,
      originX: round(own.width < 1 ? own.left : (own.left + own.right) / 2),
      intersects: box
        ? box.right > w.left + 0.5 && box.left < w.right - 0.5 && box.bottom > w.top + 0.5 && box.top < w.bottom - 0.5
        : false,
      originInside: (own.width < 1 ? own.left : (own.left + own.right) / 2) >= w.left - 1 &&
        (own.width < 1 ? own.left : (own.left + own.right) / 2) <= w.right + 1,
    };
  });
  return {
    windowBox: { left: round(w.left), top: round(w.top), width: round(w.width), height: round(w.height) },
    entries,
    visible: entries.filter((entry) => entry.intersects).length,
    drawn: entries.filter((entry) => entry.box).length,
    artDrawn: entries.filter((entry) => entry.art).length,
    originsInside: entries.filter((entry) => entry.originInside).length,
    offscreen: entries.filter((entry) => !entry.intersects).map((entry) => entry.id + (entry.box ? " at " + entry.box.left + ".." + entry.box.right : " without a drawn box")),
    visibleAllies: entries.filter((entry) => entry.intersects && entry.side === "ally").length,
    visibleEnemies: entries.filter((entry) => entry.intersects && entry.side === "enemy").length,
  };
})()`;

const parseArgs = () => {
  const argv = process.argv.slice(2);
  const out = { base: "http://127.0.0.1:5173", out: null, port: 9341 };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    if (key === "port") out[key] = Number(argv[i + 1]);
    else out[key] = argv[i + 1];
  }
  if (!out.out) throw new Error("--out is required");
  return out;
};

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, ok, actual, expected });
  return ok;
};
const checkTrue = (name, actual, detail) => {
  checks.push({ name, ok: Boolean(actual), actual, expected: detail ?? "truthy" });
  return Boolean(actual);
};

const readFixture = (file) => JSON.parse(readFileSync(path.join(REPLAYS, file), "utf8"));
const buildRecord = (replay) => ({
  storeVersion: 1,
  replay,
  warnings: [],
  summary: {
    encounterId: replay.setupSummary.encounterId,
    encounterTitle: replay.encounter ? replay.encounter.title : null,
    defeatCount: replay.setupSummary.defeatCount,
    mathSeed: replay.setupSummary.mathSeed,
    libSeed: replay.setupSummary.libSeed,
    tickLimit: replay.setupSummary.tickLimit,
    ownUnitCount: replay.setupSummary.ownUnitCount,
    enemyUnitCount: replay.setupSummary.enemyUnitCount,
    storedAt: "generated-replay-check harness",
  },
});
async function run() {
  const args = parseArgs();
  const out = path.resolve(args.out);
  mkdirSync(out, { recursive: true });
  const binary = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!binary) throw new Error("no Chrome/Edge binary found");

  const profile = mkdtempSync(path.join(tmpdir(), "ka-generated-replay-"));
  const child = spawn(binary, [
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
  ], { stdio: "ignore", windowsHide: true });

  let version = null;
  for (let attempt = 0; attempt < 120 && !version; attempt += 1) {
    await sleep(150);
    try {
      const response = await fetch(`http://127.0.0.1:${args.port}/json/version`);
      if (response.ok) version = await response.json();
    } catch { /* still starting */ }
  }
  if (!version) throw new Error("chrome devtools endpoint never came up");
  const cdp = await Cdp.connect(version.webSocketDebuggerUrl);
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
  const waitFor = async (selector, timeoutMs = 15000) => evaluate(`(async () => {
    const deadline = Date.now() + ${timeoutMs};
    while (Date.now() < deadline) {
      if (document.querySelector(${JSON.stringify(selector)})) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  })()`);
  const goto = async (url, selector) => {
    await send("Page.navigate", { url });
    await sleep(600);
    await waitFor(selector);
    await sleep(250);
  };
  const seed = async (record) => {
    const text = JSON.stringify(record);
    await evaluate(`sessionStorage.setItem("ka-generated-battle-1", ${JSON.stringify(text)}); true`);
  };
  const click = (action) => evaluate(`(() => {
    const el = document.querySelector('[data-action=${JSON.stringify(action)}]');
    if (!el) return false;
    el.click();
    return true;
  })()`);
  const scrub = (index) => evaluate(`(() => {
    const el = document.querySelector('[data-action="timeline"]');
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, String(${index}));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  const read = () => evaluate(READ);
  const measure = () => evaluate(MEASURE);
  const stageClip = () =>
    evaluate(`(() => {
      const rect = document.querySelector('[data-view-window="profile"]').getBoundingClientRect();
      return { x: rect.left + window.scrollX, y: rect.top + window.scrollY, width: rect.width, height: rect.height };
    })()`);
  const shootStage = async (file) => {
    const clip = await stageClip();
    const shot = await send("Page.captureScreenshot", {
      format: "png",
      clip: { ...clip, scale: 1 },
      captureBeyondViewport: true,
    });
    writeFileSync(path.join(out, file), Buffer.from(shot.data, "base64"));
    return clip;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: CLOCK_FREEZE });

  /* ---------------- pass 1: R.json (23 units, human + monsters, moving cells) ---------------- */
  const rJson = readFixture("R.json");
  const rRecord = buildRecord(rJson);
  const rTicks = rJson.events.map((event) => event.tick);
  const rMin = Math.min(0, ...rTicks);
  const rMax = Math.max(...rTicks);
  const rExpectedFrames = rMax - rMin + 1;

  await goto(`${args.base}/battle-replay`, "[data-battle-sprite-layer], [data-generated-replay]");
  await seed(rRecord);
  await goto(`${args.base}/battle-replay?mode=generated`, '[data-generated-replay="loaded"]');

  let state = await read();
  check("generated replay mounts on /battle-replay?mode=generated", state.status, "loaded");
  check("encounter id is the stored replay's own", state.encounter, String(rJson.setupSummary.encounterId));
  check("one frame per authoritative tick", state.frameCount, rExpectedFrames);
  check("the clock starts on the first event tick", state.minTick, rMin);
  check("the clock ends on the last event tick", state.maxTick, rMax);

  check("unit rows cover every replay unit", state.units.length, rJson.units.length);
  check("the stage draws every replay unit", state.stage.length, rJson.units.length);
  const expectedUnits = new Map(rJson.units.map((unit) => [unit.unitId, unit]));
  checkTrue("every unit row keeps its replay side/kind",
    state.units.every((row) => {
      const unit = expectedUnits.get(row.id);
      return unit && row.side === unit.side && row.kind === unit.kind;
    }), "unit row mismatch");
  checkTrue("the stage depth is the recovered 24*(column+row) formula",
    state.stage.every((entry) => {
      if (entry.depth === null || !entry.cell) return entry.depth === null && entry.cell === null;
      const [column, row] = entry.cell.split(",").map(Number);
      return entry.depth === 24 * (column + row);
    }), "depth formula mismatch");
  const depths = state.stage.map((entry) => entry.depth).filter((depth) => depth !== null);
  checkTrue("stage entries paint in ascending depth order",
    depths.every((depth, index) => index === 0 || depth >= depths[index - 1]), `depths ${depths.join(",")}`);

  const humanCount = rJson.units.filter((unit) => unit.human).length;
  check("human units without appearanceInputs use the honest generic avatar", state.genericAvatars, humanCount);
  check("no demo guard-d identity is drawn", state.demoHumanIdle.filter((id) => id === "guard-d"), []);
  check("no demo archer-c identity is drawn", state.demoHumanIdle.filter((id) => id === "archer-c"), []);
  checkTrue("the fallback note is player-facing and names the placeholder treatment",
    /placeholder|recovered art/i.test(state.fallbackText) &&
      !/humanIdleCharacterForUnit|appearanceInputs|BattleStage|param 10|param 11/.test(state.fallbackText),
    state.fallbackText.slice(0, 160));
  checkTrue("older payloads show the finish block as absent",
    state.finishPresence === "finalState-only" && /unknown/.test(state.inventory || ""),
    `finish=${state.finishPresence} inventory=${state.inventory}`);

  /* clock: exact step / scrub */
  await click("toggle-play"); // pause
  await click("restart");
  /*
   * Visual check 1/3 - the initial frame. Measured from real client rects, so it fails for the
   * defect it is there to catch: fighters placed outside the mounted window on a stage that reads
   * as empty while the roster says 23 units are alive.
   */
  const initialView = await measure();
  checkTrue("the stage window is mounted at a real size",
    initialView.windowBox && initialView.windowBox.width > 200 && initialView.windowBox.height > 60,
    JSON.stringify(initialView.windowBox));
  check("every fighter draws a real box at the initial frame", initialView.drawn, state.stage.length);
  check("no fighter is off the visible stage at the initial frame", initialView.offscreen, []);
  check("every living fighter is visible at the initial frame", initialView.visible, state.stage.length);
  check("the camera puts every fighter inside the window", initialView.originsInside, state.stage.length);
  checkTrue("both teams are visible at the initial frame",
    initialView.visibleAllies > 0 && initialView.visibleEnemies > 0,
    `allies ${initialView.visibleAllies} enemies ${initialView.visibleEnemies}`);
  checkTrue("the drawn boxes are real art sizes, not collapsed points",
    initialView.entries.every((entry) => entry.box && entry.box.width > 3 && entry.box.height > 3),
    JSON.stringify(initialView.entries.filter((entry) => !entry.box || entry.box.width <= 3).map((entry) => entry.id)));
  check("the monsters draw their recovered art, the humans their placeholders",
    initialView.artDrawn, rJson.units.filter((unit) => !unit.human).length);
  await shootStage("generated-replay-initial.png");
  let before = await read();
  await click("step-forward");
  let after = await read();
  check("step forward advances exactly one tick", after.tick - before.tick, 1);
  check("step forward advances exactly one frame", after.frameIndex - before.frameIndex, 1);
  await click("step-back");
  const back = await read();
  check("step back returns to the previous tick", back.tick, before.tick);
  await scrub(40);
  const scrubbed = await read();
  check("scrub lands on the exact tick for that frame index", scrubbed.tick, rMin + 40);
  check("scrub updates the frame index", scrubbed.frameIndex, 40);

  /* event fold at a known attack tick */
  const attack = rJson.events.find((event) => event.kind === "attack" && typeof event.hpAfter === "number" && event.targetUnitId);
  const attackIndex = attack.tick - rMin;
  await scrub(attackIndex);
  const atAttack = await read();
  const attackRow = atAttack.units.find((row) => row.id === attack.targetUnitId);
  check("the frame shows the event-folded HP at the attack tick", attackRow ? attackRow.hp : null, attack.hpAfter);
  const eventsAtTick = rJson.events.filter((event) => event.tick === attack.tick).length;
  check("the explanation panel lists every event at that tick", atAttack.explanations.length, eventsAtTick);
  checkTrue("explanations are grouped into the known buckets",
    atAttack.explanations.every((group) => ["damage", "heal", "status", "death", "prize", "action", "other"].includes(group)),
    atAttack.explanations.join(","));
  checkTrue("the recovered action events are explained in words",
    /attack|projectile|animation_request|heal/.test(atAttack.explanationsText),
    atAttack.explanationsText.slice(0, 160));

  /*
   * Visual check 2/3 - a representative combat frame (the first attack tick). The fighter pair the
   * replay is acting on must be visible, and every unit that is still alive must still be on stage.
   */
  const combatView = await measure();
  const livingAtAttack = new Set(atAttack.units.filter((row) => !row.dead).map((row) => row.id));
  check("the whole living roster is visible on the combat frame", combatView.visible, livingAtAttack.size);
  check("no living fighter leaves the visible stage on the combat frame",
    combatView.entries.filter((entry) => livingAtAttack.has(entry.id) && !entry.intersects).map((entry) => entry.id),
    []);
  const attackerBox = combatView.entries.find((entry) => entry.id === attack.attackerUnitId);
  const targetBox = combatView.entries.find((entry) => entry.id === attack.targetUnitId);
  checkTrue("the attacking fighter is drawn inside the window",
    Boolean(attackerBox) && attackerBox.intersects,
    attackerBox ? `${attackerBox.id} ${JSON.stringify(attackerBox.box)}` : "attacker not drawn");
  checkTrue("the fighter being hit is drawn inside the window",
    Boolean(targetBox) && targetBox.intersects,
    targetBox ? `${targetBox.id} ${JSON.stringify(targetBox.box)}` : "target not drawn");
  await shootStage("generated-replay-battle.png");

  /* the runner's own clip selection shows on the unit row */
  const clipRow = (await read()).units.find((row) => row.clip);
  checkTrue("an animation_request-selected clip reaches the unit row", Boolean(clipRow) && clipRow.clip === "equipWaitUp", `clip ${clipRow && clipRow.clip}`);

  /* speed control and cadence */
  await click("speed-2");
  const speed2 = await read();
  check("speed 2x is selected", speed2.speed, 2);
  check("speed 2x halves the recovered 50 ms tick", speed2.intervalMs, 25);
  await click("speed-4");
  const speed4 = await read();
  check("speed 4x is selected", speed4.speed, 4);
  check("speed 4x uses the rounded 50/4 ms tick", speed4.intervalMs, 13);

  /* real playback advance (the 50 ms freeze only blocks 1x) */
  await click("restart");
  await click("toggle-play");
  await sleep(500);
  const advanced = await read();
  checkTrue("playback advances the authoritative tick", advanced.tick > (await read()).minTick && advanced.frameIndex > 0, `tick ${advanced.tick}`);
  /* the clock stops on the final frame instead of restarting */
  await click("toggle-play"); // pause whatever the advance check left running
  await scrub(rExpectedFrames - 1);
  const atEnd = await read();
  await click("toggle-play");
  await sleep(600);
  const afterEnd = await read();
  check("scrubbing to the end lands on the final tick", atEnd.tick, rMax);
  check("the clock stops on the final frame", afterEnd.tick, rMax);
  check("the final frame pauses playback", afterEnd.playing, false);
  check("the clock does not wrap back to the first frame", afterEnd.frameIndex, rExpectedFrames - 1);

  /* ---------------- pass 2: RL.json (KO -> knock-down -> leaving lifecycle) ---------------- */
  const rlJson = readFixture("RL.json");
  const rlTicks = rlJson.events.map((event) => event.tick);
  const rlMin = Math.min(0, ...rlTicks);
  const rlMax = Math.max(...rlTicks);
  const rlFrames = rlMax - rlMin + 1;

  await goto(`${args.base}/battle-replay`, "[data-battle-sprite-layer], [data-generated-replay]");
  await seed(buildRecord(rlJson));
  await goto(`${args.base}/battle-replay?mode=generated`, '[data-generated-replay="loaded"]');

  const rlStart = await read();
  check("the leaving fixture mounts one frame per tick", rlStart.frameCount, rlFrames);
  await click("toggle-play");
  await scrub(rlFrames - 1);
  const rlEnd = await read();
  const leavingRow = rlEnd.units.find((row) => row.id === "ally:0");
  check("a KO -> leaving unit reports HP 0 from the event fold", leavingRow ? leavingRow.hp : null, 0);
  check("the unit is marked dead from the event HP", leavingRow ? leavingRow.dead : null, true);
  check("the unit is marked leaving (state 8), not merely dimmed", leavingRow ? leavingRow.leaving : null, true);
  check("the folded visual is the leaving lifecycle", leavingRow ? leavingRow.visual : null, "leaving");
  const rlHumanCount = rlJson.units.filter((unit) => unit.human).length;
  check("RL humans also stay off the demo identity", rlEnd.genericAvatars, rlHumanCount);
  check("RL draws no demo guard-d identity", rlEnd.demoHumanIdle.filter((id) => id === "guard-d"), []);
  /*
   * Visual check 3/3 - the reviewed defect's own frame: RL tick 420 with the whole enemy team still
   * alive. The old stage measured "empty" here because every fighter sat outside the mounted window.
   */
  const finalView = await measure();
  const livingAtEnd = new Set(rlEnd.units.filter((row) => !row.dead).map((row) => row.id));
  const livingEnemiesAtEnd = rlEnd.units.filter((row) => row.side === "enemy" && !row.dead).length;
  checkTrue("the final RL frame still has the reported live enemy team", livingEnemiesAtEnd === 21,
    `live enemies ${livingEnemiesAtEnd}`);
  check("every live fighter is visible on the reviewed frame",
    finalView.entries.filter((entry) => livingAtEnd.has(entry.id) && entry.intersects).length,
    livingAtEnd.size);
  check("no live fighter leaves the visible stage on the reviewed frame",
    finalView.entries.filter((entry) => livingAtEnd.has(entry.id) && !entry.intersects).map((entry) => entry.id),
    []);
  const startAlly = initialView.entries.find((entry) => entry.id === "ally:0");
  const endAlly = finalView.entries.find((entry) => entry.id === "ally:0");
  checkTrue("the departing fighter is no longer drawn where it started",
    Boolean(startAlly) && Boolean(endAlly) && Math.abs(endAlly.originX - startAlly.originX) > 20,
    `${startAlly ? startAlly.originX : "?"} -> ${endAlly ? endAlly.originX : "?"}`);
  await shootStage("generated-replay-final-frame.png");
  await click("toggle-play");
  await sleep(600);
  const rlAfter = await read();
  check("the leaving fixture also stops on the final frame", rlAfter.frameIndex, rlFrames - 1);

  /* ---------------- report ---------------- */
  const failed = checks.filter((entry) => !entry.ok);
  writeFileSync(path.join(out, "generated-replay-check.json"), JSON.stringify({
    chrome: version.Browser,
    base: args.base,
    fixtures: { r: { file: "R.json", frames: rExpectedFrames, ticks: [rMin, rMax] }, rl: { file: "RL.json", frames: rlFrames, ticks: [rlMin, rlMax] } },
    clock: { atEnd, afterEnd },
    views: { initial: initialView, combat: combatView, final: finalView },
    checks,
    passed: checks.length - failed.length,
    total: checks.length,
  }, null, 2));
  console.log(JSON.stringify({
    passed: checks.length - failed.length,
    total: checks.length,
    failed: failed.map((entry) => `${entry.name}: expected ${JSON.stringify(entry.expected)}, got ${JSON.stringify(entry.actual)}`),
    out: path.join(out, "generated-replay-check.json"),
  }, null, 1));
  const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(path.join(out, "generated-replay.png"), Buffer.from(screenshot.data, "base64"));
  await cdp.send("Browser.close").catch(() => {});
  child.kill();
  if (failed.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
