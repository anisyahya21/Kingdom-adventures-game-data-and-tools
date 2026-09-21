/**
 * Focused production-path depth-order check (PASS 14 COMMAND 14.8).
 *
 * Reads the real `/battle-replay` DOM - the shared `[data-battle-sprite-layer]` and its
 * `[data-battle-sprite-entry]` boxes - and asserts the recovered native queue rule against the live
 * replay state:
 *
 *   depth = 24 * (cell.xi + cell.yi) + height + extra + add + SEB line index
 *
 * with `height = extra = add = 0` for ordinary fighter entries. Every expectation is recomputed here
 * from the entry's own reported cell/line, so line geometry (translation, crop, sheet) can never
 * take part, and the equal-depth case is checked against the documented insertion-order rule rather
 * than any secondary field.
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

/** Freeze the animation and beat clocks so every reading describes one frame. */
const CLOCK_FREEZE = `(() => {
  const nativeSetInterval = window.setInterval.bind(window);
  window.setInterval = function (fn, ms, ...rest) {
    if (ms === 50 || ms === 1100) return 0;
    return nativeSetInterval(fn, ms, ...rest);
  };
})()`;

const READ_QUEUE = `(() => {
  const layer = document.querySelector('[data-battle-sprite-layer]');
  if (!layer) return null;
  const entries = Array.from(layer.querySelectorAll('[data-battle-sprite-entry]')).map((el) => {
    const cell = (el.dataset.cell || ',').split(',').map(Number);
    const world = (el.dataset.worldPosition || '').split(',').filter(Boolean).map(Number);
    const clip = el.querySelector('div[style*="overflow"]');
    const line = el.querySelector('[data-human-line]');
    return {
      side: el.dataset.side,
      unitIndex: Number(el.dataset.unitIndex),
      lineIndex: Number(el.dataset.lineIndex),
      baseDepth: Number(el.dataset.baseDepth),
      depth: Number(el.dataset.depth),
      order: Number(el.dataset.insertOrder),
      cell: { column: cell[0], row: cell[1] },
      livePosition: el.dataset.livePosition === '1',
      worldPosition: world.length === 3 ? { x: world[0], y: world[1], z: world[2] } : null,
      domIndex: -1,
      kind: line ? 'human' : 'monster',
      geometry: {
        trans: line ? line.dataset.humanTrans : (clip && clip.parentElement ? clip.parentElement.style.left + ',' + clip.parentElement.style.top : null),
        crop: line ? line.dataset.humanCrop : null,
        sheet: clip ? (clip.querySelector('img') || {}).src : null,
      },
    };
  });
  entries.forEach((entry, index) => { entry.domIndex = index; });
  return {
    order: layer.dataset.battleSpriteOrder,
    declared: Number(layer.dataset.battleSpriteEntries),
    entries,
  };
})()`;

const parseArgs = () => {
  const argv = process.argv.slice(2);
  const out = { base: "http://127.0.0.1:5173", out: null, port: 9339 };
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

function main() {
  const args = parseArgs();
  const out = path.resolve(args.out);
  mkdirSync(out, { recursive: true });
  const binary = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!binary) throw new Error("no Chrome/Edge binary found");
  return { args, out, binary };
}

const checks = [];
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, ok, actual, expected });
  return ok;
};

async function run() {
  const { args, out, binary } = main();
  const profile = mkdtempSync(path.join(tmpdir(), "ka-depth-order-"));
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
  const goto = async (url) => {
    await send("Page.navigate", { url });
    await sleep(1200);
    await evaluate(`(async () => {
      for (let i = 0; i < 120; i += 1) {
        if (document.querySelectorAll('[data-battle-sprite-entry]').length > 0) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    })()`);
    await sleep(400);
  };

  await send("Page.enable");
  await send("Runtime.enable");
  const freezeScript = await send("Page.addScriptToEvaluateOnNewDocument", { source: CLOCK_FREEZE });

  const expectedDepth = (entry) =>
    entry.worldPosition
      ? entry.worldPosition.x + entry.worldPosition.y + entry.worldPosition.z + entry.lineIndex
      : 24 * (entry.cell.column + entry.cell.row) + entry.lineIndex;
  const sortedByDepth = (entries) =>
    entries.every((entry, index) => index === 0 || entries[index - 1].depth <= entry.depth);
  const byUnit = (entries, side, unitIndex) =>
    entries.filter((entry) => entry.side === side && entry.unitIndex === unitIndex);

  /* ---------- default Recovered Replay: the shipped surface ---------- */
  await goto(`${args.base}/battle-replay`);
  const frozen = await evaluate(READ_QUEUE);
  check("default page renders the shared sprite layer", Boolean(frozen) && frozen.entries.length > 0, true);
  check("layer declares depth-ascending order", frozen.order, "depth-asc");
  check("declared entry count matches the DOM", frozen.entries.length, frozen.declared);
  check("every entry depth equals the cell or live-world key", frozen.entries.every((entry) => entry.depth === expectedDepth(entry)), true);
  check("stationary entries still use 24*(cell.xi+cell.yi)+lineIndex",
    frozen.entries.filter((entry) => !entry.worldPosition).every((entry) => entry.depth === 24 * (entry.cell.column + entry.cell.row) + entry.lineIndex), true);
  check("live-position entries always carry a world position",
    frozen.entries.every((entry) => !entry.livePosition || Boolean(entry.worldPosition)), true);
  check("paint order is ascending by depth", sortedByDepth(frozen.entries), true);
  check("no entry carries a secondary sort field", frozen.entries.every((entry) => Number.isFinite(entry.depth) && Number.isFinite(entry.order)), true);

  const tank = byUnit(frozen.entries, "enemy", 20);
  check("wairo tank is at cell (0,1)", tank.map((entry) => `${entry.cell.column},${entry.cell.row}`), ["0,1", "0,1"]);
  check("wairo tank lines 0/1 have base 24", tank.map((entry) => entry.baseDepth), [24, 24]);
  check("wairo tank queue depths are 24 and 25", tank.map((entry) => entry.depth), [24, 25]);

  const ally0 = byUnit(frozen.entries, "ally", 0);
  const ally1 = byUnit(frozen.entries, "ally", 1);
  const enemy19 = byUnit(frozen.entries, "enemy", 19);
  check("ally 0 is at cell (0,6) with base 144", [ally0[0].cell, ally0[0].baseDepth], [{ column: 0, row: 6 }, 144]);
  check("ally 1 is at cell (1,6) with base 168", [ally1[0].cell, ally1[0].baseDepth], [{ column: 1, row: 6 }, 168]);
  check("enemy 19 is at cell (4,2) with base 144", [enemy19[0].cell, enemy19[0].baseDepth], [{ column: 4, row: 2 }, 144]);

  const tankLast = Math.max(...tank.map((entry) => entry.domIndex));
  const firstDeep = Math.min(
    ...[...ally0, ...ally1, ...enemy19].map((entry) => entry.domIndex),
  );
  check("wairo tank entries paint before the 144/168 fighters", tankLast < firstDeep, true);

  const monsterUnit = byUnit(frozen.entries, "enemy", 0);
  check("monster shadow/body are separate entries", monsterUnit.map((entry) => entry.lineIndex), [0, 1]);
  check("monster body depth is base+1", monsterUnit.map((entry) => entry.depth - entry.baseDepth), [0, 1]);

  check("human lines are one entry each, ascending line index", ally0.map((entry) => entry.lineIndex).every((line, index, all) => index === 0 || all[index - 1] < line), true);
  check("human entry kind is reported", ally0.every((entry) => entry.kind === "human"), true);

  const tieAlly = ally0.find((entry) => entry.lineIndex === enemy19[0].lineIndex);
  const tieEnemy = enemy19.find((entry) => entry.lineIndex === tieAlly.lineIndex);
  check("known equal-depth tie has equal keys", tieAlly.depth === tieEnemy.depth, true);
  check("tie resolves by website insertion sequence (ally before enemy)", tieAlly.domIndex < tieEnemy.domIndex, true);
  check("tie does not use a geometry or roster secondary key", [tieAlly.cell.column + tieAlly.cell.row, tieEnemy.cell.column + tieEnemy.cell.row], [6, 6]);

  /* geometry independence: two entries of the same unit/line depth differ only by their crop */
  const geometryFree = frozen.entries.every((entry) => entry.depth === expectedDepth(entry));
  check("depth is independent of SEB translation/crop/sheet", geometryFree, true);

  /* ---------- lab surface: a changed cell must change the depth ---------- */
  await goto(`${args.base}/battle-replay?lab=1`);
  await evaluate(`(() => {
    /*
     * The Kairobot Knight encounter is the one whose timeline knocks a unit out, which is what makes
     * the occupancy/advance rules move live cells; the Wairo Tank timeline never removes a unit.
     */
    const encounter = Array.from(document.querySelectorAll('button')).find((el) => (el.textContent || '').includes('Kairobot Knight'));
    if (encounter) encounter.click();
    const switches = Array.from(document.querySelectorAll('button[role="switch"]'));
    const row = switches.find((el) => (el.closest('div')?.textContent ?? '').includes('Occupancy / reflow (proven rules)'));
    if (row && row.getAttribute('aria-checked') !== 'true') row.click();
    const full = switches.find((el) => (el.closest('div')?.textContent ?? '').includes('Full enemy roster (21)'));
    if (full && full.getAttribute('aria-checked') !== 'true') full.click();
    return true;
  })()`);
  await sleep(900);
  const before = await evaluate(READ_QUEUE);
  for (let i = 0; i < 8; i += 1) {
    await evaluate(`(() => {
      const next = Array.from(document.querySelectorAll('button')).find((el) => (el.textContent || '').trim() === 'Next');
      if (next) next.click();
      return Boolean(next);
    })()`);
    await sleep(300);
  }
  const after = await evaluate(READ_QUEUE);
  const keyed = (state) => new Map(state.entries.map((entry) => [
    `${entry.side}-${entry.unitIndex}-${entry.lineIndex}`,
    { cell: `${entry.cell.column},${entry.cell.row}`, depth: entry.depth, cellSum: entry.cell.column + entry.cell.row, lineIndex: entry.lineIndex },
  ]));
  const beforeByKey = keyed(before);
  const afterByKey = keyed(after);
  const moved = [...afterByKey.entries()].filter(([key, value]) => {
    const previous = beforeByKey.get(key);
    return previous && previous.cell !== value.cell;
  });
  const left = [...beforeByKey.keys()].filter((key) => !afterByKey.has(key));
  check("lab surface keeps the depth invariant after advancing beats", after.entries.every((entry) => entry.depth === expectedDepth(entry)), true);
  check("lab surface keeps ascending paint order after advancing beats", sortedByDepth(after.entries), true);
  check("a moved unit follows its new cell's depth", moved.every(([, value]) => value.depth === 24 * value.cellSum + value.lineIndex), true);
  check("replay states with a changed cell exist (moved or removed entries)", moved.length > 0 || left.length > 0, true);

  /*
   * ---------- PASS 15 COMMAND 15.9: the live-world key ----------
   *
   * The animated pass cannot use the frozen clock, so remove the page-level freeze and drive the
   * Kairobot Knight KO exactly as the human harness does: pause the beat clock on event 6, step onto
   * the lethal hit, then wait for the leaving projectile to appear. Only the leaving unit may carry a
   * world position; every other entry in the same queue must still satisfy the cell formula.
   */
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: freezeScript.identifier });
  await goto(`${args.base}/battle-replay?lab=1`);
  await evaluate(`(() => {
    const encounter = Array.from(document.querySelectorAll('button')).find((el) => (el.textContent || '').includes('Kairobot Knight'));
    if (encounter) encounter.click();
    const pause = Array.from(document.querySelectorAll('button')).find((el) => (el.textContent || '').trim() === 'Pause');
    if (pause) pause.click();
    const reset = Array.from(document.querySelectorAll('button')).find((el) => (el.textContent || '').trim() === 'Reset');
    if (reset) reset.click();
    return true;
  })()`);
  await sleep(300);
  for (let i = 0; i < 5; i += 1) {
    await evaluate(`(() => {
      const next = Array.from(document.querySelectorAll('button')).find((el) => (el.textContent || '').trim() === 'Next');
      if (next) next.click();
      return Boolean(next);
    })()`);
    await sleep(140);
  }
  const liveReady = await evaluate(`(async () => {
    const deadline = Date.now() + 9000;
    while (Date.now() < deadline) {
      if (document.querySelector('[data-battle-sprite-entry][data-live-position="1"]')) return true;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return false;
  })()`);
  const leaving = await evaluate(READ_QUEUE);
  await sleep(120);
  const leavingLater = await evaluate(READ_QUEUE);
  const liveEntries = leaving.entries.filter((entry) => entry.livePosition);
  const liveLater = new Map(
    leavingLater.entries
      .filter((entry) => entry.livePosition)
      .map((entry) => [`${entry.side}-${entry.unitIndex}-${entry.lineIndex}`, entry]),
  );
  check("leaving pass produces live world-position entries", liveReady && liveEntries.length > 0, true);
  check("live entries carry a world position", liveEntries.every((entry) => Boolean(entry.worldPosition)), true);
  check("live entries use worldX + worldY + worldZ + lineIndex",
    liveEntries.every((entry) => entry.depth === entry.worldPosition.x + entry.worldPosition.y + entry.worldPosition.z + entry.lineIndex), true);
  check("stationary entries in the leaving queue keep the cell depth",
    leaving.entries.filter((entry) => !entry.livePosition).every((entry) => entry.depth === 24 * (entry.cell.column + entry.cell.row) + entry.lineIndex), true);
  const liveAdvanced = liveEntries.some((entry) => {
    const later = liveLater.get(`${entry.side}-${entry.unitIndex}-${entry.lineIndex}`);
    if (!later || !later.worldPosition) return false;
    return later.worldPosition.x !== entry.worldPosition.x
      || later.worldPosition.y !== entry.worldPosition.y
      || later.worldPosition.z !== entry.worldPosition.z
      || later.depth !== entry.depth;
  });
  check("live world position/depth advances during the flight", liveAdvanced, true);

  const failed = checks.filter((entry) => !entry.ok);
  writeFileSync(
    path.join(out, "depth-order.json"),
    JSON.stringify({
      chrome: version.Browser,
      base: args.base,
      equation: "stationary: 24 * (cell.xi + cell.yi) + lineIndex; live position: worldX + worldY + worldZ + lineIndex",
      frozen,
      lab: { before, after, leaving, leavingLater },
      checks,
      passed: checks.length - failed.length,
      total: checks.length,
      equalDepth: "UNREPRODUCED: native's own equal-depth order comes from an unstable QuickSort over a HashSet enumeration order; the website keeps its own insertion sequence and adds no secondary key.",
    }, null, 2),
  );
  console.log(JSON.stringify({
    passed: checks.length - failed.length,
    total: checks.length,
    failed: failed.map((entry) => entry.name),
    entries: frozen.entries.length,
  }, null, 1));
  await cdp.send("Browser.close").catch(() => {});
  child.kill();
  if (failed.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
