/**
 * Responsive-scale / anchoring driver for the battle replay.
 *
 * Measures the real page at two substantially different stage widths with labels+debug off and on,
 * at the same encounter, roster and toggle set, and screenshots the stage element for each case.
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

const MEASURE = `(() => {
  const rr = (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(3), y: +r.y.toFixed(3), w: +r.width.toFixed(3), h: +r.height.toFixed(3) }; };
  const scene = document.querySelector('div[style*="background-image"]');
  if (!scene) return null;
  const host = scene.parentElement;
  const cs = getComputedStyle(scene);
  /*
   * PASS 14: the sprite lines of every unit now live in one shared per-line depth layer
   * ([data-battle-sprite-layer]), one [data-battle-sprite-entry] per SEB line, ordered by the
   * recovered native depth. Collect them per unit first and join them to the unit's label/debug box
   * below. Non-queued surfaces (legacy labs) keep their sprites inside the unit box as before.
   */
  const readHumanLayer = (cell) => {
    const clip = cell.querySelector('div');
    const img = clip ? clip.querySelector('img') : null;
    return {
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
      cellRect: rr(cell),
      clipRect: clip ? rr(clip) : null,
      imgSrc: img ? new URL(img.src).pathname : null,
      natural: img ? [img.naturalWidth, img.naturalHeight] : null,
    };
  };
  const spriteGroups = new Map();
  for (const entry of scene.querySelectorAll('[data-battle-sprite-entry]')) {
    const key = entry.dataset.side + "-" + entry.dataset.unitIndex;
    let group = spriteGroups.get(key);
    if (!group) {
      group = { lines: [], humanContainer: null, humanLayers: [] };
      spriteGroups.set(key, group);
    }
    for (const clip of entry.querySelectorAll('div')) {
      const st = getComputedStyle(clip);
      if (st.overflow !== 'hidden') continue;
      const img = clip.querySelector(':scope > img');
      if (!img || !img.src.includes('/monster-original/')) continue;
      const cell = clip.parentElement;
      const wrapper = cell.parentElement;
      group.lines.push({
        sheet: img.src.split('/').pop(),
        cellRect: rr(cell),
        cellStyle: { w: cell.style.width, h: cell.style.height, transform: getComputedStyle(cell).transform },
        clipRect: rr(clip),
        clipStyle: { left: clip.style.left, top: clip.style.top, width: clip.style.width, height: clip.style.height },
        imgRect: rr(img),
        natural: [img.naturalWidth, img.naturalHeight],
        imgStyle: { left: img.style.left, top: img.style.top },
        sebmStyle: { left: wrapper.style.left, top: wrapper.style.top },
      });
    }
    const queuedHuman = entry.querySelector('[data-human-idle]');
    if (queuedHuman) {
      group.humanContainer = group.humanContainer ?? queuedHuman;
      for (const cell of queuedHuman.querySelectorAll('[data-human-line]')) {
        group.humanLayers.push(readHumanLayer(cell));
      }
    }
  }
  const units = [];
  for (const root of scene.querySelectorAll(':scope > div.absolute')) {
    if (root.hasAttribute('data-battle-sprite-layer')) continue;
    const group = spriteGroups.get(root.dataset.side + "-" + root.dataset.unitIndex) ?? null;
    const debugEl = Array.from(root.querySelectorAll('span')).find((s) => (s.textContent || '').startsWith('#'));
    const canvas = root.querySelector('canvas');
    const lines = [];
    for (const clip of root.querySelectorAll('div')) {
      const st = getComputedStyle(clip);
      if (st.overflow !== 'hidden') continue;
      const img = clip.querySelector(':scope > img');
      if (!img || !img.src.includes('/monster-original/')) continue;
      const cell = clip.parentElement;
      const wrapper = cell.parentElement;
      lines.push({
        sheet: img.src.split('/').pop(),
        cellRect: rr(cell),
        cellStyle: { w: cell.style.width, h: cell.style.height, transform: getComputedStyle(cell).transform },
        clipRect: rr(clip),
        clipStyle: { left: clip.style.left, top: clip.style.top, width: clip.style.width, height: clip.style.height },
        imgRect: rr(img),
        natural: [img.naturalWidth, img.naturalHeight],
        imgStyle: { left: img.style.left, top: img.style.top },
        sebmStyle: { left: wrapper.style.left, top: wrapper.style.top },
      });
    }
    /** sprite lines painted for this unit by the shared depth queue, in queue (paint) order */
    if (group) lines.push(...group.lines);
    const layers = Array.from(root.querySelectorAll('span')).filter((s) => (getComputedStyle(s).backgroundImage || 'none') !== 'none');
    const rects = layers.map(rr);
    const union = rects.length ? {
      x: Math.min(...rects.map((r) => r.x)),
      y: Math.min(...rects.map((r) => r.y)),
      w: Math.max(...rects.map((r) => r.x + r.w)) - Math.min(...rects.map((r) => r.x)),
      h: Math.max(...rects.map((r) => r.y + r.h)) - Math.min(...rects.map((r) => r.y)),
    } : null;
    /* the frozen human renderer: one div per drawn SEB line, each carrying its own record */
    const humanContainer = root.querySelector('[data-human-idle]');
    const human = humanContainer ? {
      id: humanContainer.dataset.humanIdle,
      draws: Number(humanContainer.dataset.humanDraws),
      skipped: Number(humanContainer.dataset.humanSkipped),
      layers: Array.from(humanContainer.querySelectorAll('[data-human-line]')).map((cell) => {
        const clip = cell.querySelector('div');
        const img = clip ? clip.querySelector('img') : null;
        return {
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
          cellRect: rr(cell),
          clipRect: clip ? rr(clip) : null,
          imgSrc: img ? new URL(img.src).pathname : null,
          natural: img ? [img.naturalWidth, img.naturalHeight] : null,
        };
      }),
    } : group && group.humanContainer ? {
      id: group.humanContainer.dataset.humanIdle,
      draws: Number(group.humanContainer.dataset.humanDraws),
      skipped: Number(group.humanContainer.dataset.humanSkipped),
      layers: group.humanLayers,
    } : null;
    if (!lines.length && !canvas && !union && !human) continue;
    units.push({
      debug: debugEl ? debugEl.textContent : null,
      sebRows: Array.from(root.querySelectorAll('span')).filter((s) => /^m\\d+ /.test(s.textContent || "")).map((s) => s.textContent),
      rootRect: rr(root),
      rootStyle: { left: root.style.left, top: root.style.top, transform: getComputedStyle(root).transform },
      lines,
      composite: union ? { union, layers: layers.map((s) => ({ l: s.style.left, t: s.style.top, w: s.style.width, h: s.style.height, bg: (s.style.backgroundImage || '').split('/').pop() })) } : null,
      human,
      canvas: canvas ? {
        backing: [canvas.width, canvas.height],
        rect: rr(canvas),
        css: { w: getComputedStyle(canvas).width, h: getComputedStyle(canvas).height },
        style: { left: canvas.style.left, top: canvas.style.top, width: canvas.style.width, height: canvas.style.height },
        className: canvas.className,
      } : null,
    });
  }
  return {
    sebRowTotal: Array.from(document.querySelectorAll("span")).filter((s) => /^m\\d+ /.test(s.textContent || "")).length,
    sebRowSample: (() => { const row = Array.from(document.querySelectorAll("span")).find((s) => /^m\\d+ /.test(s.textContent || "")); return row ? row.textContent.slice(0, 90) : null; })(),
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio, visualScale: window.visualViewport ? window.visualViewport.scale : null },
    host: host ? rr(host) : null,
    hostClientWidth: host ? host.clientWidth : null,
    /* The scene keeps its 481x197 logical box; the presentation may scale X and Y differently
       (native 196/192 vertical presentation), so both axis scales are reported explicitly. */
    scene: (() => {
      const sceneW = Number(scene.dataset.sceneWidth || 481);
      const sceneH = Number(scene.dataset.sceneHeight || 197);
      const rect = rr(scene);
      const hostStyle = host ? getComputedStyle(host) : null;
      return {
        rect,
        transform: cs.transform,
        backgroundSize: cs.backgroundSize,
        backgroundPosition: cs.backgroundPosition,
        cssWidth: cs.width,
        cssHeight: cs.height,
        sceneLogicalWidth: sceneW,
        sceneLogicalHeight: sceneH,
        scaleX: +(rect.w / sceneW).toFixed(6),
        scaleY: +(rect.h / sceneH).toFixed(6),
        profileId: scene.dataset.viewProfile || null,
        logicalViewWidth: Number(scene.dataset.logicalViewWidth || 0),
        logicalSourceHeight: Number(scene.dataset.logicalSourceHeight || 0),
        backgroundX: Number(scene.dataset.backgroundX ?? "NaN"),
        verticalRatio: Number(scene.dataset.verticalRatio ?? "NaN"),
      };
    })(),
    /* The wrapper is the surface window: it exposes logical X 0..logicalViewWidth. */
    viewWindow: host ? {
      rect: rr(host),
      clientWidth: host.clientWidth,
      overflow: getComputedStyle(host).overflow,
      logicalViewWidth: Number(host.dataset.logicalViewWidth || 0),
    } : null,
    units,
  };
})()`;

/**
 * Same-frame label/debug invariance snapshot.
 *
 * Requirement: toggling labels/debug must not move a body origin. The page's native animation
 * clock is a 50 ms `setInterval` (CLOCK_FREEZE below stubs it out for the whole run), so every
 * snapshot here shows the same animation frame. `stable` repeats the untouched measurement 200 ms
 * later and must be identical - that is the proof the clock really was frozen, which is what makes
 * an off/on difference attributable to the toggles alone.
 */
const SAME_FRAME = `(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rr = (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(3), y: +r.y.toFixed(3), w: +r.width.toFixed(3), h: +r.height.toFixed(3) }; };
  const unionOf = (rects) => rects.length ? {
    x: Math.min(...rects.map((r) => r.x)),
    y: Math.min(...rects.map((r) => r.y)),
    w: Math.max(...rects.map((r) => r.x + r.w)) - Math.min(...rects.map((r) => r.x)),
    h: Math.max(...rects.map((r) => r.y + r.h)) - Math.min(...rects.map((r) => r.y)),
  } : null;
  const scene = document.querySelector('div[style*="background-image"]');
  /*
   * PASS 14: monster sprite lines are painted by the shared per-line depth layer, so the per-unit
   * sprite rectangles are read from that layer and joined to their unit box (label/debug layer) by
   * data-side / data-unit-index. Non-queued surfaces keep their sprites inside the unit box.
   */
  const spriteGroups = () => {
    const map = new Map();
    for (const entry of scene.querySelectorAll('[data-battle-sprite-entry]')) {
      const key = entry.dataset.side + "-" + entry.dataset.unitIndex;
      let group = map.get(key);
      if (!group) {
        group = { clips: [], sheets: [] };
        map.set(key, group);
      }
      for (const clip of entry.querySelectorAll('div')) {
        const st = getComputedStyle(clip);
        if (st.overflow !== 'hidden') continue;
        const img = clip.querySelector(':scope > img');
        if (!img || !img.src.includes('/monster-original/')) continue;
        group.clips.push(rr(clip));
        group.sheets.push(img.src.split('/').pop());
      }
    }
    return map;
  };
  const snapshot = () => {
    const groups = spriteGroups();
    const units = [];
    for (const root of scene.querySelectorAll(':scope > div.absolute')) {
      if (root.hasAttribute('data-battle-sprite-layer')) continue;
      const group = groups.get(root.dataset.side + "-" + root.dataset.unitIndex);
      const canvas = root.querySelector('canvas');
      const clips = [];
      const sheets = [];
      for (const clip of root.querySelectorAll('div')) {
        const st = getComputedStyle(clip);
        if (st.overflow !== 'hidden') continue;
        const img = clip.querySelector(':scope > img');
        if (!img || !img.src.includes('/monster-original/')) continue;
        clips.push(rr(clip));
        sheets.push(img.src.split('/').pop());
      }
      if (group) {
        clips.push(...group.clips);
        sheets.push(...group.sheets);
      }
      const bgSpans = Array.from(root.querySelectorAll('span')).filter((s) => (getComputedStyle(s).backgroundImage || 'none') !== 'none');
      const kind = canvas ? 'canvas' : (clips.length ? 'monster' : (bgSpans.length ? 'composite' : null));
      const art = canvas ? rr(canvas) : (clips.length ? unionOf(clips) : (bgSpans.length ? unionOf(bgSpans.map(rr)) : null));
      units.push({ kind, sheets, root: rr(root), art });
    }
    return {
      debugRows: Array.from(scene.querySelectorAll('span')).filter((s) => (s.textContent || '').startsWith('#')).length,
      units,
    };
  };
  const setSwitch = (label, on) => {
    const switches = Array.from(document.querySelectorAll('button[role="switch"]'));
    const index = switches.findIndex((el) => (el.closest("div")?.textContent ?? "").includes(label));
    if (index < 0) return false;
    if ((switches[index].getAttribute("aria-checked") === "true") !== on) switches[index].click();
    return (switches[index].getAttribute("aria-checked") === "true") === on;
  };
  const applyToggles = (on) => {
    setSwitch("Unit name / cell labels", on);
    setSwitch("Debug: slot / cell / index", on);
    setSwitch("Debug: SEB frame / line selection", on);
  };
  const before = snapshot();
  applyToggles(true);
  await sleep(150);
  const after = snapshot();
  applyToggles(false);
  await sleep(150);
  const restored = snapshot();
  /* no toggles touched from here on: the pose must not change either */
  await sleep(200);
  const stable = snapshot();
  return { before, after, restored, stable };
})()`;

/**
 * Harness clock freeze.
 *
 * `src/pages/battle-replay.tsx` advances the native animation clock with
 * `setInterval(..., NATIVE_FRAME_MS = 50)` and the replay beat with `setInterval(..., 1100)`.
 * Both are stubbed out before any application code runs so that every measurement in this driver
 * shows exactly the same animation frame. No other `setInterval` exists on this route, and React's
 * scheduler does not use `setInterval`, so nothing else is affected.
 */
const CLOCK_FREEZE = `(() => {
  const nativeSetInterval = window.setInterval.bind(window);
  window.setInterval = function (fn, ms, ...rest) {
    if (ms === 50 || ms === 1100) return 0;
    return nativeSetInterval(fn, ms, ...rest);
  };
})()`;

/**
 * Formation / preview capture for the positioning-fix regression tests.
 *
 * Every reading is taken on the frozen clock, so all states describe the same animation frame and
 * the same beat: only the placement inputs change (roster cap, occupancy switch). The cells come
 * from the page's own debug rows and from its projected roots; the module probes call the
 * *production* formation function and the production preview envelope directly.
 */
const FORMATION_CAPTURE = `(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const scene = document.querySelector('div[style*="background-image"]');
  const sceneRect = scene.getBoundingClientRect();
  /* two axis scales: the presentation applies the native 196/192 vertical stretch to the whole
     scene, so browser pixels are X-scaled and Y-scaled separately. Logical values below are the
     page's own logical battle space (481x197), comparable with nativeViewPos and the SEB records. */
  const sceneScale = sceneRect.width / Number(scene.dataset.sceneWidth || 481);
  const sceneScaleY = sceneRect.height / Number(scene.dataset.sceneHeight || 197);
  const rr = (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(3), y: +r.y.toFixed(3), w: +r.width.toFixed(3), h: +r.height.toFixed(3) }; };
  const logical = (rect) => ({
    x: +((rect.x - sceneRect.x) / sceneScale).toFixed(3),
    y: +((rect.y - sceneRect.y) / sceneScaleY).toFixed(3),
  });
  const logicalSize = (rect) => ({
    w: +(rect.w / sceneScale).toFixed(3),
    h: +(rect.h / sceneScaleY).toFixed(3),
  });
  const setSwitch = (label, on) => {
    const switches = Array.from(document.querySelectorAll('button[role="switch"]'));
    const index = switches.findIndex((el) => (el.closest("div")?.textContent ?? "").includes(label));
    if (index < 0) return false;
    if ((switches[index].getAttribute("aria-checked") === "true") !== on) switches[index].click();
    return true;
  };

  /* labels + both debug rows on, occupancy off, full roster, no grid: the audited state */
  setSwitch("Unit name / cell labels", true);
  setSwitch("Debug: slot / cell / index", true);
  setSwitch("Debug: SEB frame / line selection", false);
  setSwitch("Occupancy / reflow (proven rules)", false);
  setSwitch("Full enemy roster (21)", true);
  setSwitch("Debug: battle grid (8x16 lattice)", false);
  await sleep(250);

  const readState = () => {
    const units = [];
    for (const root of scene.querySelectorAll(':scope > div.absolute')) {
      const debugEl = Array.from(root.querySelectorAll("span")).find((el) => (el.textContent || "").startsWith("#"));
      const match = /^#(\\d+) slot c(-?\\d+)r(-?\\d+) · cell c(-?\\d+)r(-?\\d+)/.exec(debugEl ? debugEl.textContent : "");
      if (!match) continue;
      const rect = rr(root);
      const hasHuman = root.dataset.side === "ally" || Boolean(root.querySelector("canvas")) || Boolean(root.querySelector("[data-human-idle]")) || Array.from(root.querySelectorAll("span")).some((el) => (el.style.backgroundImage || "").includes("z_tmp"));
      units.push({
        side: hasHuman ? "ally" : "enemy",
        index: Number(match[1]),
        slot: [Number(match[2]), Number(match[3])],
        cell: [Number(match[4]), Number(match[5])],
        logical: logical(rect),
      });
    }
    return units;
  };

  const states = {};
  states.static = readState();
  setSwitch("Full enemy roster (21)", false);
  await sleep(250);
  states.cappedRoster = readState();
  setSwitch("Full enemy roster (21)", true);
  setSwitch("Occupancy / reflow (proven rules)", true);
  await sleep(250);
  states.occupancy = readState();
  setSwitch("Occupancy / reflow (proven rules)", false);
  await sleep(250);
  states.restored = readState();

  /* the camera offset the page actually feeds to the projection: printed by the grid debug label */
  setSwitch("Debug: battle grid (8x16 lattice)", true);
  await sleep(250);
  const gridLabel = Array.from(scene.querySelectorAll("span")).map((el) => el.textContent || "").find((text) => /cam x-?\\d+/.test(text)) || null;
  const cameraMatch = gridLabel ? /cam x(-?\\d+)/.exec(gridLabel) : null;
  setSwitch("Debug: battle grid (8x16 lattice)", false);
  await sleep(150);

  /* frozen human idle: the default human renderer of the stage */
  const humans = {};
  /*
   * PASS 15 COMMAND 15.6: the frozen-anchor assertions below are specifically about the previously
   * recovered EQUIP_WAIT frame-0 geometry, and the allies now animate (damage reaction, knock-down
   * spin, static down). Select the idle step explicitly instead of assuming that the page happens to
   * be sitting on one: turn the native human renderer on, pause the beat clock, reset, and advance
   * until every human reports the wait state. The state is recorded with the geometry so the fixture
   * can fail loudly if it did not reach the state the assertions are about.
   */
  setSwitch("Frozen human idle (Guard D / Archer C)", true);
  await sleep(450);
  const clickControl = (label) => {
    const button = Array.from(document.querySelectorAll("button")).find((el) => el.textContent.trim() === label);
    if (!button) return false;
    button.click();
    return true;
  };
  clickControl("Pause");
  clickControl("Reset");
  await sleep(250);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const states = Array.from(document.querySelectorAll('[data-human-idle]'))
      .map((el) => el.dataset.humanNativeState ?? "unknown");
    if (states.length > 0 && states.every((state) => state === "wait")) break;
    clickControl("Next");
    await sleep(250);
  }
  const idleSelection = Array.from(document.querySelectorAll('[data-human-idle]')).map((el) => ({
    id: el.dataset.humanIdle,
    nativeState: el.dataset.humanNativeState ?? null,
    behaviour: el.dataset.humanBehaviour ?? null,
    seb: el.dataset.humanSeb ?? null,
    frame: el.dataset.humanFrame ?? null,
    direction: el.dataset.humanDirection ?? null,
    reactionUpdate: el.dataset.humanReactionUpdate ?? null,
    knockdownUpdate: el.dataset.humanKnockdownUpdate ?? null,
  }));
  /*
   * PASS 14: one queued entry per drawn human line, so the lines are grouped back into their
   * character here (DOM order = ascending line order inside one unit).
   */
  for (const container of scene.querySelectorAll('[data-human-idle]')) {
    if (!container) continue;
    const root = container.closest('[data-battle-sprite-entry]') ?? container.parentElement?.parentElement ?? container;
    const id = container.dataset.humanIdle;
    const merged = humans[id] ?? {
      id,
      side: root.closest("[data-battle-sprite-entry]")?.dataset.side ?? null,
      unitIndex: Number(root.closest("[data-battle-sprite-entry]")?.dataset.unitIndex ?? -1),
      entityOrigin: logical(rr(root)),
      draws: Number(container.dataset.humanDraws),
      skipped: Number(container.dataset.humanSkipped),
      nativeState: container.dataset.humanNativeState ?? null,
      behaviour: container.dataset.humanBehaviour ?? null,
      seb: container.dataset.humanSeb ?? null,
      frame: container.dataset.humanFrame ?? null,
      direction: container.dataset.humanDirection ?? null,
      reactionUpdate: container.dataset.humanReactionUpdate ?? null,
      knockdownUpdate: container.dataset.humanKnockdownUpdate ?? null,
      layers: [],
    };
    merged.layers.push(...Array.from(container.querySelectorAll('[data-human-line]')).map((cell) => {
        const clip = cell.querySelector('div');
        return {
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
          cellOrigin: logical(rr(cell)),
          cellLogical: logicalSize(rr(cell)),
          clipOrigin: clip ? logical(rr(clip)) : null,
          clipLogical: clip ? logicalSize(rr(clip)) : null,
        };
      }));
    humans[id] = merged;
  }

  /* legacy renderers (comparison mode): the composite and the preview canvas, same frozen frame */
  setSwitch("Frozen human idle (Guard D / Archer C)", false);
  await sleep(450);
  let archer = null;
  let guard = null;
  for (const root of scene.querySelectorAll(':scope > div.absolute')) {
    const canvas = root.querySelector("canvas");
    if (canvas && !archer) {
      archer = {
        entityOrigin: logical(rr(root)),
        canvasStyle: { left: canvas.style.left, top: canvas.style.top, width: canvas.style.width, height: canvas.style.height },
        canvasRect: logical(rr(canvas)),
        canvasSize: (({ w, h }) => ({ w, h }))(rr(canvas)),
        canvasSizeLogical: logicalSize(rr(canvas)),
        backing: [canvas.width, canvas.height],
      };
    }
    const layers = Array.from(root.querySelectorAll("span")).filter((el) => (el.style.backgroundImage || "").includes("z_tmp"));
    if (layers.length && !guard) {
      guard = {
        entityOrigin: logical(rr(root)),
        layers: layers.map((el) => ({ left: el.style.left, top: el.style.top, w: el.style.width, h: el.style.height, bg: (el.style.backgroundImage || "").split("/").pop() })),
      };
    }
  }
  setSwitch("Frozen human idle (Guard D / Archer C)", true);
  await sleep(450);

  /* the production modules: the shared formation and the preview envelope */
  const lib = await import("/src/lib/battle-replay.ts");
  const renderer = await import("/src/lib/character-renderer.ts");
  const encounter = lib.encounterById("wairo-tank");
  const offsets = {};
  for (const count of [0, 1, 4, 5, 6, 19, 20, 21, 22]) offsets[count] = lib.nativeRowOffset(count);
  const allyCounts = {};
  for (const allyCount of [1, 2, 3, 4, 5, 6]) {
    const formation = lib.nativeInitialFormation(allyCount, encounter.enemies.length);
    allyCounts[allyCount] = {
      rowOffset: formation.rowOffset,
      firstEnemy: formation.enemySlots[0],
      lastEnemy: formation.enemySlots[formation.enemySlots.length - 1],
      firstAlly: formation.allySlots[0],
    };
  }
  const occupancyBeat0 = lib.simulateOccupancy(encounter)[0].units.map((unit) => ({ side: unit.side, index: unit.index, cell: unit.cell }));
  const archerParams = { jobName: "Archer", rank: "C", variant: 1, equipState: "up", scale: 2, poseFrame: 0 };
  const envelope = await renderer.getCharacterPreviewEnvelope(archerParams);
  const envelopeRight = await renderer.getCharacterPreviewEnvelope({ ...archerParams, equipState: "right" });
  const summariseEnvelope = (value) =>
    value && {
      poseName: value.poseName,
      width: value.width,
      height: value.height,
      originX: value.originX,
      originY: value.originY,
      cropX: value.cropX,
      cropY: value.cropY,
      cropW: value.cropW,
      cropH: value.cropH,
      poseReferences: value.poseReferences,
    };

  return {
    sceneScale: +sceneScale.toFixed(6),
    sceneScaleY: +sceneScaleY.toFixed(6),
    viewProfile: {
      id: scene.dataset.viewProfile || null,
      logicalViewWidth: Number(scene.dataset.logicalViewWidth || 0),
      sourceHeight: Number(scene.dataset.logicalSourceHeight || 0),
      backgroundX: Number(scene.dataset.backgroundX ?? "NaN"),
      verticalRatio: Number(scene.dataset.verticalRatio ?? "NaN"),
      windowWidth: scene.parentElement ? scene.parentElement.clientWidth : null,
    },
    camera: cameraMatch ? Number(cameraMatch[1]) : null,
    gridLabel,
    roster: { allies: encounter.allies.length, enemies: encounter.enemies.length },
    states,
    humans,
    idleSelection,
    archer,
    guard,
    module: {
      offsets,
      allyCounts,
      occupancyBeat0,
      envelope: summariseEnvelope(envelope),
      envelopeRight: summariseEnvelope(envelopeRight),
    },
  };
})()`;

/**
 * View-profile capture.
 *
 * Reads the presentation facts of whichever profile is selected plus the same geometry in *logical*
 * battle units, so two profiles can be compared directly: the profile must only change background
 * centering, the visible window and the presentation scale. Fighter logical origins and sprite
 * ratios have to stay identical, which is what makes "backgroundX is not applied to fighters"
 * measurable instead of assumed.
 */
const VIEW_PROFILE_CAPTURE = `(() => {
  const rr = (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(3), y: +r.y.toFixed(3), w: +r.width.toFixed(3), h: +r.height.toFixed(3) }; };
  const scene = document.querySelector('div[style*="background-image"]');
  if (!scene) return null;
  const host = scene.parentElement;
  const sceneRect = scene.getBoundingClientRect();
  const sceneW = Number(scene.dataset.sceneWidth || 481);
  const sceneH = Number(scene.dataset.sceneHeight || 197);
  const scaleX = sceneRect.width / sceneW;
  const scaleY = sceneRect.height / sceneH;
  const cs = getComputedStyle(scene);
  const matrix = new DOMMatrixReadOnly(cs.transform);
  const logical = (rect) => ({
    x: +((rect.x - sceneRect.x) / scaleX).toFixed(3),
    y: +((rect.y - sceneRect.y) / scaleY).toFixed(3),
  });
  /**
   * One SEB line record per monster clip inside the given scope (a unit box, or one entry of the
   * shared per-line depth layer). Declared after logical(), which it uses. PASS 14: the sprite lines
   * are owned by the layer, so each unit's lines are collected from that unit's entries and joined by
   * side/unit index - never by DOM parentage.
   */
  const spriteLayer = scene.querySelector('[data-battle-sprite-layer]');
  const collectLines = (scope) => {
    const lines = [];
    for (const clip of scope.querySelectorAll('div')) {
      const st = getComputedStyle(clip);
      if (st.overflow !== 'hidden') continue;
      const img = clip.querySelector(':scope > img');
      if (!img || !img.src.includes('/monster-original/')) continue;
      const cell = clip.parentElement;
      if (!cell || !cell.parentElement) continue;
      const cellRect = rr(cell);
      const clipRect = rr(clip);
      lines.push({
        sheet: img.src.split('/').pop(),
        cellOrigin: logical(cellRect),
        cellLogical: { w: +(cellRect.w / scaleX).toFixed(3), h: +(cellRect.h / scaleY).toFixed(3) },
        cropOrigin: logical(clipRect),
        cropLogical: { w: +(clipRect.w / scaleX).toFixed(3), h: +(clipRect.h / scaleY).toFixed(3) },
        imgNatural: [img.naturalWidth, img.naturalHeight],
        imgStyle: { width: img.style.width, height: img.style.height },
        lineOrigin: logical(rr(cell.parentElement)),
      });
    }
    return lines;
  };
  /** stage-scoped shared-layer inventory, grouped by the stable side/unit-index key */
  const spriteLinesByUnit = new Map();
  if (spriteLayer) {
    for (const entry of spriteLayer.querySelectorAll('[data-battle-sprite-entry]')) {
      const key = entry.dataset.side + ":" + entry.dataset.unitIndex;
      spriteLinesByUnit.set(key, (spriteLinesByUnit.get(key) ?? []).concat(collectLines(entry)));
    }
  }
  const humanContainerForUnit = (side, index) =>
    spriteLayer
      ? spriteLayer.querySelector(
          '[data-battle-sprite-entry][data-side="' + side + '"][data-unit-index="' + index + '"] [data-human-idle]',
        )
      : null;
  const units = [];
  for (const root of scene.querySelectorAll(':scope > div.absolute')) {
    const debugEl = Array.from(root.querySelectorAll('span')).find((el) => (el.textContent || '').startsWith('#'));
    const match = /^#(\\d+) slot c(-?\\d+)r(-?\\d+) · cell c(-?\\d+)r(-?\\d+)/.exec(debugEl ? debugEl.textContent : '');
    if (!match) continue;
    const humanContainer = root.querySelector('[data-human-idle]') ?? humanContainerForUnit(root.dataset.side, root.dataset.unitIndex);
    const hasHuman = root.dataset.side === 'ally' || Boolean(root.querySelector('canvas')) || Boolean(humanContainer) || Array.from(root.querySelectorAll('span')).some((el) => (el.style.backgroundImage || '').includes('z_tmp'));
    const lines = collectLines(root).concat(spriteLinesByUnit.get(root.dataset.side + ":" + root.dataset.unitIndex) ?? []);
    const canvas = root.querySelector('canvas');
    units.push({
      index: Number(match[1]),
      side: hasHuman ? 'ally' : 'enemy',
      cell: [Number(match[4]), Number(match[5])],
      origin: logical(rr(root)),
      lines,
      human: humanContainer ? {
        id: humanContainer.dataset.humanIdle,
        draws: Number(humanContainer.dataset.humanDraws),
        layers: Array.from(humanContainer.querySelectorAll('[data-human-line]')).map((cell) => {
          const clip = cell.querySelector('div');
          return {
            line: Number(cell.dataset.humanLine),
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
            cellOrigin: logical(rr(cell)),
            cellLogical: { w: +(rr(cell).w / scaleX).toFixed(3), h: +(rr(cell).h / scaleY).toFixed(3) },
            clipOrigin: clip ? logical(rr(clip)) : null,
          };
        }),
      } : null,
      humanCanvas: canvas ? {
        logical: logical(rr(canvas)),
        size: { w: +(rr(canvas).w / scaleX).toFixed(3), h: +(rr(canvas).h / scaleY).toFixed(3) },
        style: { left: canvas.style.left, top: canvas.style.top, width: canvas.style.width, height: canvas.style.height },
      } : null,
    });
  }
  const backgroundX = Number(scene.dataset.backgroundX ?? 'NaN');
  const logicalViewWidth = Number(scene.dataset.logicalViewWidth || 0);
  const sourceHeight = Number(scene.dataset.logicalSourceHeight || 0);
  const bgW = 480;
  const bgH = 196;
  return {
    profileId: scene.dataset.viewProfile,
    sheet: {
      scaleX: +scaleX.toFixed(6),
      scaleY: +scaleY.toFixed(6),
      matrix: { a: matrix.a, d: matrix.d },
      backgroundSize: cs.backgroundSize,
      backgroundPosition: cs.backgroundPosition,
      window: {
        clientWidth: host.clientWidth,
        rect: rr(host),
        overflow: getComputedStyle(host).overflow,
        logicalViewWidth,
        dataLogicalViewWidth: Number(host.dataset.logicalViewWidth || 0),
      },
      sceneRect: rr(scene),
    },
    facts: {
      logicalViewWidth,
      backgroundX,
      sourceHeight,
      presentationRatio: Number(scene.dataset.verticalRatio ?? 'NaN'),
      bgLogical: { x: backgroundX, y: 0, w: bgW, h: bgH },
      visibleSourceX: [Math.max(0, -backgroundX), Math.min(bgW, logicalViewWidth - backgroundX)],
      windowHeightLogical: +(rr(host).h / scaleY).toFixed(3),
    },
    units,
  };
})()`;

/**
 * Human image-state card capture.
 *
 * The battle-replay page prints the recovered native human image model (the 17-slot imgIds table
 * plus the creation/refresh pipeline). This probe reads the rendered card only.
 */
const HUMAN_MODEL_CAPTURE = `(() => {
  const titleNode = Array.from(document.querySelectorAll('*')).find(
    (el) => el.children.length === 0 && (el.textContent || '').trim() === 'Human image state (recovered native model)',
  );
  const table = Array.from(document.querySelectorAll('table')).find((t) => (t.textContent || '').includes('IMG_FOOT'));
  const rows = table
    ? Array.from(table.querySelectorAll('tbody tr')).map((tr) => {
        const cells = Array.from(tr.querySelectorAll('td'));
        return {
          index: (cells[0] ? cells[0].textContent : '').trim(),
          kind: (cells[1] ? cells[1].textContent : '').trim(),
          rule: ((cells[2] && cells[2].querySelector('span') ? cells[2].querySelector('span').textContent : '') || '').trim(),
          note: ((cells[2] && cells[2].querySelectorAll('span').length > 1 ? cells[2].querySelectorAll('span')[1].textContent : '') || '').trim(),
          evidence: (cells[3] ? cells[3].textContent : '').trim(),
        };
      })
    : [];
  const body = document.body.textContent || '';
  return {
    titleFound: Boolean(titleNode),
    slotRows: rows.length,
    slots: rows,
    hasJobInputs: body.indexOf('imgBodys') >= 0 && body.indexOf('imgFoots') >= 0 && body.indexOf('imgHands') >= 0,
    hasWeaponInput: body.indexOf('JobData.weapon') >= 0 && body.indexOf('JobData.shield') >= 0,
    hasAliasStep: body.indexOf('those arrays are the SAME objects') >= 0,
    hasUnknownRowPlacement: body.indexOf('HumanResourceSet row placement') >= 0,
    hasAllyPlaceholders: body.indexOf('no native job row, gender or equipment') >= 0,
    sceneStillPresent: Boolean(document.querySelector('div[style*="background-image"]')),
  };
})()`;

/**
 * Focused native fighter-gauge capture (PASS 13 COMMAND 13.2): the production rate/fill/geometry
 * functions probed against the recovered native table, plus every rendered `[data-fighter-gauge]`
 * element with its unit origin, so geometry, asset, visibility and human/monster equality can be
 * checked without labels.
 */
const GAUGE_CAPTURE = `(async () => {
  const scene = document.querySelector('div[style*="background-image"]');
  if (!scene) return null;
  const sceneRect = scene.getBoundingClientRect();
  const scaleX = sceneRect.width / Number(scene.dataset.sceneWidth || 481);
  const scaleY = sceneRect.height / Number(scene.dataset.sceneHeight || 197);
  const logical = (r) => ({ x: +((r.x - sceneRect.x) / scaleX).toFixed(3), y: +((r.y - sceneRect.y) / scaleY).toFixed(3) });
  const units = [];
  let totalUnits = 0;
  for (const root of scene.querySelectorAll(':scope > div.absolute')) {
    const gauges = Array.from(root.querySelectorAll('[data-fighter-gauge]'));
    if (root.hasAttribute('data-battle-sprite-layer')) continue;
    /* unit roots carry either the frozen human container or a unit sprite; HUD/overlay roots carry
       the battle-assets ui/indicators/effects/number images and are not units */
    const isUnit = root.hasAttribute('data-unit-root') ||
      Boolean(root.querySelector('[data-human-idle], [data-fighter-gauges]')) ||
      Array.from(root.querySelectorAll('img')).some((img) => {
        const src = img.getAttribute('src') || '';
        return img.getAttribute('alt') !== 'BOSS' &&
          !/\\/battle-assets\\/(ui|indicators|effects|numbers|text|gauge)\\//.test(src);
      });
    if (isUnit) totalUnits += 1;
    if (!gauges.length) continue;
    units.push({
      human: root.dataset.side === 'ally' || Boolean(root.querySelector('[data-human-idle]')),
      origin: logical(root.getBoundingClientRect()),
      gauges: gauges.map((el) => ({
        kind: el.dataset.fighterGauge,
        frame: Number(el.dataset.gaugeFrame),
        rate: Number(el.dataset.gaugeRate),
        current: Number(el.dataset.gaugeCurrent),
        max: Number(el.dataset.gaugeMax),
        fill: Number(el.dataset.gaugeFillWidth),
        x: Number(el.dataset.gaugeX),
        y: Number(el.dataset.gaugeY),
        crop: el.dataset.gaugeCrop,
        asset: el.dataset.gaugeAsset,
        rect: logical(el.getBoundingClientRect()),
      })),
    });
  }
  const lib = await import("/src/lib/native-fighter-gauges.ts");
  const table = [
    ["full", 100, 100],
    ["half", 50, 100],
    ["one-with-large-max", 1, 100000],
    ["zero", 0, 100],
    ["over-max", 250, 100],
    ["zero-max", 5, 0],
    ["negative-max", 5, -1],
  ].map(([label, current, max]) => {
    const rate = lib.fighterGaugeRate(current, max);
    return { label, current, max, rate, fill: lib.fighterGaugeFillWidth(15, rate) };
  });
  return {
    units,
    totalUnits,
    unitsWithGauges: units.length,
    table,
    hpLayout: lib.fighterGaugeLayout("hp", 0, 0, 50, 100),
    mpLayout: lib.fighterGaugeLayout("mp", 0, 0, 50, 100),
    mostFront: {
      allyFront: lib.isMostFrontUnit("ally", 6, 5),
      allyBack: lib.isMostFrontUnit("ally", 7, 5),
      enemyFront: lib.isMostFrontUnit("enemy", 5, 5),
      enemyBack: lib.isMostFrontUnit("enemy", 4, 5),
    },
  };
})()`;

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = { base: "http://127.0.0.1:5173", out: null, port: 9335 };
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
  mkdirSync(shotsDir, { recursive: true });

  const binary = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!binary) throw new Error("no Chrome/Edge binary found");
  const profile = mkdtempSync(path.join(tmpdir(), "ka-integration-"));
  const child = spawn(
    binary,
    [
      "--headless=new",
      `--remote-debugging-port=${args.port}`,
      `--user-data-dir=${profile}`,
      "--window-size=1600,1100",
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
  const setViewport = async (width, height) => {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(450);
  };
  const shoot = async (rect, file) => {
    const capture = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: rect.x, y: rect.y, width: Math.round(rect.w), height: Math.round(rect.h), scale: 1 },
    });
    writeFileSync(file, Buffer.from(capture.data, "base64"));
  };
  const setToggle = async (label, on) => {
    const result = await evaluate(`(() => {
      const switches = Array.from(document.querySelectorAll('button[role="switch"]'));
      const index = switches.findIndex((el) => (el.closest("div")?.textContent ?? "").includes(${JSON.stringify(label)}));
      if (index < 0) return null;
      const current = switches[index].getAttribute("aria-checked") === "true";
      if (current !== ${on}) switches[index].click();
      return { index, was: current, row: (switches[index].closest("div")?.textContent ?? "").slice(0, 40) };
    })()`);
    await sleep(350);
    return result;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Network.enable");

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
    await sleep(400);
    /*
     * PASS 15 COMMAND 15.5: the human allies animate, so a human-anchor probe only measures the
     * frozen EQUIP_WAIT frame 0 when no ally is acting or reacting. Pause the beat clock, reset to
     * the encounter's first step and advance until both allies report the idle clip - the lab
     * surface opens on its own encounter, whose first steps can be an ally attack.
     */
    if (url.includes("/battle-replay")) {
      await evaluate(`(async () => {
        const click = (label) => {
          const button = Array.from(document.querySelectorAll("button"))
            .find((el) => el.textContent.trim() === label);
          if (button) button.click();
        };
        const setSwitch = (label, on) => {
          const switches = Array.from(document.querySelectorAll('button[role="switch"]'));
          const row = switches.find((el) => (el.closest("div")?.textContent ?? "").includes(label));
          if (!row) return false;
          if ((row.getAttribute("aria-checked") === "true") !== on) row.click();
          return true;
        };
        /* The native human renderer is a lab switch and is off by default there, so the fixture has
           to turn it on before any data-human-idle element can be read at all. */
        /* the lab surface hydrates after the load event: wait for the switch row itself */
        for (let wait = 0; wait < 80; wait += 1) {
          if (setSwitch("Frozen human idle (Guard D / Archer C)", true)) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        for (let wait = 0; wait < 60; wait += 1) {
          if (document.querySelectorAll("[data-human-idle]").length > 0) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        click("Pause");
        click("Reset");
        await new Promise((resolve) => setTimeout(resolve, 250));
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const states = Array.from(document.querySelectorAll("[data-human-idle]"))
            .map((el) => el.dataset.humanNativeState ?? "unknown");
          if (states.length > 0 && states.every((state) => state === "wait")) return true;
          click("Next");
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return false;
      })()`);
      await sleep(250);
    }
  };

  logs.reset();
  /* freeze the page's two clocks before the first navigation so every probe shows one frame */
  await send("Page.addScriptToEvaluateOnNewDocument", { source: CLOCK_FREEZE });
  await setViewport(1600, 1100);
  /* `?lab=1` is the experimental surface: the encounter/arena/view-profile pickers, the toggle
     grid and the evidence cards. The default page is the locked Recovered Replay view, which exposes
     none of those controls - the harnesses drive the lab surface and the recovered-time defaults
     are asserted separately in tools/human-idle-check. */
  await goto(`${args.base}/battle-replay?lab=1`);
  await evaluate(`(async () => {
    for (let i = 0; i < 200; i += 1) {
      const images = Array.from(document.images);
      if (images.length > 0 && images.every((img) => img.complete)) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  })()`);
  await sleep(800);

  /* reference capture: default encounter, default toggles, the same viewport as the stored
     pre-fix screenshot of the same page */
  const defaultProbe = await evaluate(MEASURE);
  if (defaultProbe?.host) await shoot(defaultProbe.host, path.join(shotsDir, "before-repro-default-encounter.png"));

  /* the audit encounter: 21 enemies incl. the Wairo Tank boss */
  await evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll("button")).filter((node) => /Wairo Tank/.test(node.textContent || ""));
    nodes[0]?.click();
    return true;
  })()`);
  await sleep(900);

  const cases = [];
  const sameFrame = {};
  const formation = {};
  /*
   * PASS 15 COMMAND 15.6: the `cases` probes below (and the `humans` density group that reads them)
   * measure the drawn human lines, which are only the recovered EQUIP_WAIT frame-0 geometry while
   * neither ally is attacking or reacting. `goto` already selected the idle step, but the lab
   * surface's own toggle clicks happen after it, so select the idle step again here - immediately
   * before the probes - and let it report whether it reached the state.
   */
  const idleSelectionProbe = await evaluate(`(async () => {
    const click = (label) => {
      const button = Array.from(document.querySelectorAll("button"))
        .find((el) => el.textContent.trim() === label);
      if (button) button.click();
      return Boolean(button);
    };
    const setSwitch = (label, on) => {
      const switches = Array.from(document.querySelectorAll('button[role="switch"]'));
      const row = switches.find((el) => (el.closest("div")?.textContent ?? "").includes(label));
      if (!row) return false;
      if ((row.getAttribute("aria-checked") === "true") !== on) row.click();
      return true;
    };
    for (let wait = 0; wait < 80; wait += 1) {
      if (setSwitch("Frozen human idle (Guard D / Archer C)", true)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    for (let wait = 0; wait < 60; wait += 1) {
      if (document.querySelectorAll("[data-human-idle]").length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    click("Pause");
    click("Reset");
    await new Promise((resolve) => setTimeout(resolve, 250));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const states = Array.from(document.querySelectorAll("[data-human-idle]"))
        .map((el) => el.dataset.humanNativeState ?? "unknown");
      if (states.length > 0 && states.every((state) => state === "wait")) {
        return { reached: true, states };
      }
      click("Next");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return {
      reached: false,
      states: Array.from(document.querySelectorAll("[data-human-idle]"))
        .map((el) => [el.dataset.humanIdle, el.dataset.humanNativeState ?? null, el.dataset.humanBehaviour ?? null]),
    };
  })()`);
  for (const width of [1400, 700]) {
    for (const toggleState of ["off", "on"]) {
      await setViewport(width, 900);
      const toggleTrace = [
        await setToggle("Unit name / cell labels", toggleState === "on"),
        await setToggle("Debug: slot / cell / index", toggleState === "on"),
        await setToggle("Debug: SEB frame / line selection", toggleState === "on"),
      ];
      const switchStates = await evaluate(`Array.from(document.querySelectorAll('button[role="switch"]')).map((el) => ({ label: (el.closest("div")?.textContent ?? "").slice(0, 40), on: el.getAttribute("aria-checked") }))`);
      const probe = await evaluate(MEASURE);
      const file = `shots/stage-${width}-${toggleState}.png`;
      if (probe?.host) await shoot(probe.host, path.join(out, file));
      cases.push({ width, toggleState, screenshot: file, toggleTrace, switchStates, probe });
      console.log(`  measured width=${width} toggles=${toggleState} hostWidth=${probe?.hostClientWidth} scene=${probe?.scene?.rect?.w} units=${probe?.units?.length}`);
    }

    /* same-frame label/debug invariance: measured, flipped and measured again inside one turn */
    await setViewport(width, 900);
    await setToggle("Unit name / cell labels", false);
    await setToggle("Debug: slot / cell / index", false);
    await setToggle("Debug: SEB frame / line selection", false);
    await sleep(400);
    sameFrame[width] = await evaluate(SAME_FRAME);
    console.log(
      `  same-frame invariance width=${width} units=${sameFrame[width]?.after?.units?.length} ` +
        `debugRows off=${sameFrame[width]?.before?.debugRows} on=${sameFrame[width]?.after?.debugRows} restored=${sameFrame[width]?.restored?.debugRows}`,
    );

    /* formation / preview capture: frozen frame, states stepped through the page's own switches */
    formation[width] = await evaluate(FORMATION_CAPTURE);
    const staticState = formation[width]?.states?.static ?? [];
    const occupancyState = formation[width]?.states?.occupancy ?? [];
    console.log(
      `  formation width=${width} camera=${formation[width]?.camera} units=${staticState.length} ` +
        `enemy0=${JSON.stringify(staticState.find((u) => u.side === "enemy" && u.index === 0)?.cell)} ` +
        `boss=${JSON.stringify(staticState.find((u) => u.side === "enemy" && u.index === 20)?.cell)} ` +
        `occupancyBoss=${JSON.stringify(occupancyState.find((u) => u.side === "enemy" && u.index === 20)?.cell)}`,
    );
  }

  /* ---------------------------------------------------------------- view profiles
     The same frozen state measured under both presentation profiles: the recording-supported
     ~240-logical window and the 481-wide debug view. Only background centering, the window and the
     presentation scale may differ; fighter logical coordinates and sprite ratios must not. */
  await setViewport(1400, 900);
  await setToggle("Unit name / cell labels", false);
  await setToggle("Debug: slot / cell / index", true);
  await setToggle("Debug: SEB frame / line selection", false);
  await setToggle("Occupancy / reflow (proven rules)", false);
  await setToggle("Full enemy roster (21)", true);
  await sleep(450);
  const profiles = {};
  for (const id of ["internal", "recording"]) {
    const selected = await evaluate(`(() => {
      const button = document.querySelector('button[data-view-profile-option="${id}"]');
      if (!button) return null;
      button.click();
      return button.dataset.viewProfileOption;
    })()`);
    await sleep(650);
    const capture = await evaluate(VIEW_PROFILE_CAPTURE);
    profiles[id] = { selected, capture };
    if (capture?.sheet?.window?.rect) {
      await shoot(capture.sheet.window.rect, path.join(shotsDir, `profile-${id}-1400.png`));
    }
    console.log(
      `  view profile ${id} selected=${selected} windowW=${capture?.sheet?.window?.clientWidth} ` +
        `bgX=${capture?.facts?.backgroundX} visible=${JSON.stringify(capture?.facts?.visibleSourceX)} ` +
        `scaleY/scaleX=${capture ? (capture.sheet.scaleY / capture.sheet.scaleX).toFixed(5) : "?"}`,
    );
  }
  /* leave the page on its default profile */
  await evaluate(`(() => { const button = document.querySelector('button[data-view-profile-option="recording"]'); if (button) button.click(); return true; })()`);
  await sleep(300);
  await setToggle("Debug: slot / cell / index", false);
  await sleep(300);

  /* the recovered human image-state card, as the page renders it */
  const humanModel = await evaluate(HUMAN_MODEL_CAPTURE);
  /* the recovered native fighter HP/MP bars (PASS 13 COMMAND 13.2) */
  const gauges = await evaluate(GAUGE_CAPTURE);
  console.log(
    `  human model card: title=${humanModel?.titleFound} rows=${humanModel?.slotRows} ` +
      `aliasStep=${humanModel?.hasAliasStep} slot2=${JSON.stringify(humanModel?.slots?.[2]?.rule ?? null)}`,
  );

  writeFileSync(
    path.join(out, "integration.json"),
    JSON.stringify(
      { chrome: version.Browser, defaultEncounter: defaultProbe, idleSelectionProbe, cases, sameFrame, formation, profiles, humanModel, gauges, ...logs.snapshot() },
      null,
      2,
    ),
  );

  /* smoke: the preview component is used unchanged outside the battle's logical-anchoring path */
  logs.reset();
  await setViewport(1400, 900);
  const smokes = {};
  for (const route of ["/survey-planner", "/kairo-room", "/loadout"]) {
    await goto(`${args.base}${route}`);
    await sleep(1200);
    smokes[route] = await evaluate(`(() => {
      const canvases = Array.from(document.querySelectorAll("canvas.ka-pixel-art"));
      return {
        canvases: canvases.length,
        logicalAnchored: canvases.filter((el) => el.style.left || el.style.top || el.style.position === "absolute").length,
        sized: canvases.filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0).length,
      };
    })()`);
  }
  writeFileSync(
    path.join(out, "preview-smoke.json"),
    JSON.stringify({ ...smokes, ...logs.snapshot() }, null, 2),
  );
  console.log(JSON.stringify({ previewSmoke: smokes }, null, 1));
  console.log(JSON.stringify({ cases: cases.map((c) => ({ width: c.width, toggles: c.toggleState, hostWidth: c.probe?.hostClientWidth, sceneWidth: c.probe?.scene?.rect?.w })) }, null, 1));

  await cdp.send("Browser.close").catch(() => {});
  child.kill();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  /* never leave the spawned browser holding the harness open after a failed run */
  setTimeout(() => process.exit(1), 100);
});
