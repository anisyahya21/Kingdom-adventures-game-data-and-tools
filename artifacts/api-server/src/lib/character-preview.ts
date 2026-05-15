import fs from "fs";
import path from "path";
import { PNG } from "pngjs";

const RES_DIRS: Record<number, string> = {
  14: "face",
  2: "body",
  12: "body",
  0: "hand",
  4: "hand",
  16: "hand",
  18: "hand",
  1: "shoes",
  5: "shoes",
  15: "foot",
  19: "foot",
};

type QueryValue = string | string[] | undefined;
type QueryMap = Record<string, QueryValue>;

type JobRow = {
  id: number;
  name: string;
  resHead: number | null;
  imgHeads: Array<number | null>;
  resBody: number | null;
  imgBodys: Array<number | null>;
  resHand: number | null;
  imgHands: Array<number | null>;
  resFoot: number | null;
  imgFoots: Array<number | null>;
  weapon: number | null;
  shield: number | null;
};

type EquipRow = {
  id: number;
  name: string;
  category: number | null;
  type: number | null;
  rank: number | null;
  res: number | null;
  img: number | null;
};

type SebOp = {
  type: number;
  u: number;
  v: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
};

type OptSlot = {
  status: string;
  destX?: number;
  destY?: number;
  srcX?: number;
  srcY?: number;
  w?: number;
  h?: number;
  cellW?: number;
  cellH?: number;
  recovered?: boolean;
};

type RgbaImage = {
  width: number;
  height: number;
  data: Buffer;
};

const repoRoot = findRepoRoot(process.cwd());
const kaAssetsDir = path.join(repoRoot, "artifacts", "api-server", "data", "sprites");
const jobCsvPath = path.join(repoRoot, "data", "Sheet csv", "KA GameData - Job.csv");
const equipCsvPath = path.join(repoRoot, "data", "sheet-research", "raw-copies", "KA GameData - Equip.csv");

type SpriteRulesEntry = { cellW: number; cellH: number; slots: Record<string, Omit<OptSlot, "cellW" | "cellH">>; };
type SpriteRules = Record<string, { inf: Record<string, Record<string, string>>; opts: Record<string, SpriteRulesEntry>; }>;

const imgCache = new Map<string, RgbaImage | null>();
const optCache = new Map<string, Map<string, OptSlot>>();
const infCache = new Map<string, Map<number, string>>();
let jobCache: JobRow[] | null = null;
let equipCache: EquipRow[] | null = null;
let spriteRulesCache: SpriteRules | null = null;

function loadSpriteRules(): SpriteRules {
  if (spriteRulesCache) return spriteRulesCache;
  const jsonPath = path.join(repoRoot, "artifacts", "api-server", "data", "sprite-rules.json");
  spriteRulesCache = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as SpriteRules;
  return spriteRulesCache;
}

function findRepoRoot(startDir: string): string {
  let current = path.resolve(startDir);
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml")) && fs.existsSync(path.join(current, "artifacts"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(startDir);
}

function firstQuery(query: QueryMap, key: string, fallback = ""): string {
  const value = query[key];
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function toInt(value: string | undefined, fallback: number): number {
  if (value == null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      cell = "";
      if (row.some((part) => part !== "")) rows.push(row);
      row = [];
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  row.push(cell.trim());
  if (row.some((part) => part !== "")) rows.push(row);
  return rows;
}

function cell(row: string[], index: number): string {
  return row[index]?.trim() ?? "";
}

function intCell(row: string[], index: number): number | null {
  const raw = cell(row, index);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function loadJobs(): JobRow[] {
  if (jobCache) return jobCache;
  const rows = parseCsv(fs.readFileSync(jobCsvPath, "utf8")).slice(3);
  jobCache = rows.flatMap((row) => {
    const id = intCell(row, 0);
    if (id == null) return [];
    return [{
      id,
      name: cell(row, 1),
      resHead: intCell(row, 14),
      imgHeads: [intCell(row, 15), intCell(row, 16), intCell(row, 17)],
      resBody: intCell(row, 18),
      imgBodys: [intCell(row, 19), intCell(row, 20), intCell(row, 21)],
      resHand: intCell(row, 22),
      imgHands: [intCell(row, 23), intCell(row, 24), intCell(row, 25)],
      resFoot: intCell(row, 26),
      imgFoots: [intCell(row, 27), intCell(row, 28), intCell(row, 29)],
      weapon: intCell(row, 30),
      shield: intCell(row, 31),
    }];
  });
  return jobCache;
}

function loadEquip(): EquipRow[] {
  if (equipCache) return equipCache;
  const rows = parseCsv(fs.readFileSync(equipCsvPath, "utf8")).slice(1);
  equipCache = rows.flatMap((row) => {
    const id = intCell(row, 0);
    if (id == null) return [];
    return [{
      id,
      name: cell(row, 1),
      category: intCell(row, 2),
      type: intCell(row, 3),
      rank: intCell(row, 6),
      res: intCell(row, 7),
      img: intCell(row, 8),
    }];
  });
  return equipCache;
}

function parseImgInf(infPath: string): Map<number, string> {
  const cached = infCache.get(infPath);
  if (cached) return cached;
  const result = new Map<number, string>();
  const rules = loadSpriteRules();
  const dir = path.basename(path.dirname(infPath));
  const infStem = path.parse(infPath).name;
  const dirRules = rules[dir];
  if (dirRules) {
    const infMap = dirRules.inf[infStem] ?? {};
    for (const [k, v] of Object.entries(infMap)) {
      const idx = Number.parseInt(k, 10);
      if (Number.isFinite(idx)) result.set(idx, v);
    }
  }
  infCache.set(infPath, result);
  return result;
}

function readImage(filePath: string): RgbaImage | null {
  if (imgCache.has(filePath)) return imgCache.get(filePath) ?? null;
  if (!fs.existsSync(filePath)) {
    imgCache.set(filePath, null);
    return null;
  }
  const decoded = PNG.sync.read(fs.readFileSync(filePath));
  const image = { width: decoded.width, height: decoded.height, data: Buffer.from(decoded.data) };
  imgCache.set(filePath, image);
  return image;
}

function optKey(v: number, u: number): string {
  return `${v},${u}`;
}

function decodeOpt(optPath: string, _srcImage?: RgbaImage | null): Map<string, OptSlot> {
  const cached = optCache.get(optPath);
  if (cached) return cached;

  const slots = new Map<string, OptSlot>();
  const rules = loadSpriteRules();
  const dir = path.basename(path.dirname(optPath));
  const basename = path.parse(optPath).name;
  const dirRules = rules[dir];
  if (dirRules) {
    const entry = dirRules.opts[basename];
    if (entry) {
      const { cellW, cellH } = entry;
      for (const [k, v] of Object.entries(entry.slots)) {
        slots.set(k, { ...v, cellW, cellH });
      }
    }
  }
  optCache.set(optPath, slots);
  return slots;
}

// Legacy binary decoder kept here only for reference — no longer called at runtime.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _decodeOptBinary(optPath: string, srcImage?: RgbaImage | null): Map<string, OptSlot> {
  const slots = new Map<string, OptSlot>();
  if (!fs.existsSync(optPath)) return slots;
  const data = fs.readFileSync(optPath);
  if (data.length < 4) return slots;

  const cellW = data[0] ?? 24;
  const cellH = data[1] ?? 24;
  const cols = data[2] ?? 0;
  const rows = data[3] ?? 0;
  const allSrcX = new Set<number>();
  let pos = 4;
  let done = false;

  for (let v = 0; v < rows && !done; v += 1) {
    for (let u = 0; u < cols; u += 1) {
      if (pos >= data.length) {
        done = true;
        break;
      }
      const flag = data[pos];
      if (flag === 0) {
        pos += 1;
      } else if (flag === 1) {
        if (pos + 15 <= data.length) {
          allSrcX.add(data.readUInt16LE(pos + 8));
          pos += 15;
        } else if (pos + 12 <= data.length) {
          allSrcX.add(data.readUInt16LE(pos + 8));
          done = true;
          break;
        } else {
          done = true;
          break;
        }
      } else {
        pos += 1;
      }
    }
  }

  const sortedSrcX = [...allSrcX].sort((a, b) => a - b);
  const rightBound = (srcX: number, imgW: number): number => sortedSrcX.find((x) => x > srcX) ?? imgW;

  pos = 4;
  for (let v = 0; v < rows; v += 1) {
    for (let u = 0; u < cols; u += 1) {
      const key = optKey(v, u);
      if (pos >= data.length) {
        slots.set(key, { status: "implicit_empty" });
        continue;
      }
      const flag = data[pos];
      if (flag === 0) {
        slots.set(key, { status: "empty" });
        pos += 1;
      } else if (flag === 1) {
        if (pos + 15 <= data.length) {
          slots.set(key, {
            destX: data.readUInt16LE(pos + 4),
            destY: data.readUInt16LE(pos + 6),
            srcX: data.readUInt16LE(pos + 8),
            srcY: data.readUInt16LE(pos + 10),
            w: data.readUInt16LE(pos + 12),
            h: data[pos + 14],
            cellW,
            cellH,
            status: "filled",
          });
          pos += 15;
        } else if (pos + 12 <= data.length) {
          const destX = data.readUInt16LE(pos + 4);
          const destY = data.readUInt16LE(pos + 6);
          const srcX = data.readUInt16LE(pos + 8);
          const srcY = data.readUInt16LE(pos + 10);
          const imgW = srcImage?.width ?? cellW;
          const imgH = srcImage?.height ?? cellH;
          const rb = rightBound(srcX, imgW);
          slots.set(key, {
            destX,
            destY,
            srcX,
            srcY,
            w: Math.max(0, Math.min(rb - srcX, imgW - srcX)),
            h: Math.max(0, Math.min(cellH - destY, imgH - srcY)),
            cellW,
            cellH,
            status: "short_recovered",
            recovered: true,
          });
          pos = data.length;
        } else if (pos + 11 <= data.length) {
          const destX = data.readUInt16LE(pos + 4);
          const destY = data.readUInt16LE(pos + 6);
          const srcX = data.readUInt16LE(pos + 8);
          const srcY = data[pos + 10] ?? 0;
          const imgW = srcImage?.width ?? cellW;
          const imgH = srcImage?.height ?? cellH;
          const rb = rightBound(srcX, imgW);
          slots.set(key, {
            destX,
            destY,
            srcX,
            srcY,
            w: Math.max(0, Math.min(rb - srcX, imgW - srcX)),
            h: Math.max(0, Math.min(cellH - destY, imgH - srcY)),
            cellW,
            cellH,
            status: "short_recovered",
            recovered: true,
          });
          pos = data.length;
        } else {
          slots.set(key, { status: "corrupt" });
          pos = data.length;
        }
      } else {
        slots.set(key, { status: "unknown_flag" });
        pos += 1;
      }
    }
  }

  return slots;
}

function s16(value: number): number {
  return value > 32767 ? value - 65536 : value;
}

function parseSeb(sebName: string, frameIndex: number): SebOp[] {
  const raw = fs.readFileSync(path.join(kaAssetsDir, "chara", sebName));
  const frameCount = raw.readUInt16BE(4);
  const marker2 = raw.readUInt16BE(6);
  const ops: SebOp[] = [];
  let off = 4;

  while (off + 20 <= raw.length) {
    if (raw.readUInt16BE(off) === frameCount && raw.readUInt16BE(off + 2) === marker2) {
      const idx = Math.min(frameIndex, Math.max(0, frameCount - 1));
      const rec = off + idx * 20;
      if (rec + 20 <= raw.length) {
        const layerType = raw.readUInt16BE(rec + 6);
        if (layerType !== 65535 && layerType <= 13) {
          const w = s16(raw.readUInt16BE(rec + 12));
          const h = s16(raw.readUInt16BE(rec + 14));
          if (w > 0 && h > 0) {
            ops.push({
              type: layerType,
              u: Math.floor(s16(raw.readUInt16BE(rec + 8)) / w),
              v: Math.floor(s16(raw.readUInt16BE(rec + 10)) / h),
              w,
              h,
              ox: s16(raw.readUInt16BE(rec + 16)),
              oy: s16(raw.readUInt16BE(rec + 18)),
            });
          }
        }
      }
      off += Math.max(20, frameCount * 20);
    } else {
      off += 2;
    }
  }
  return ops;
}

function resolvePart(res: number | null, imgIndices: Array<number | null>, variant: number): [string | null, string | null] {
  if (res == null) return [null, null];
  const dir = RES_DIRS[res] ?? null;
  if (!dir) return [null, null];
  const idx = imgIndices[variant] ?? null;
  if (idx == null || idx < 0) return [dir, null];
  const inf = parseImgInf(path.join(kaAssetsDir, dir, "img.inf"));
  return [dir, inf.get(idx) ?? null];
}

function resolveWeaponSprite(equipId: number | null): [string | null, string | null] {
  if (equipId == null || equipId < 0) return [null, null];
  const equip = loadEquip().find((entry) => entry.id === equipId);
  if (!equip || equip.img == null || equip.img < 0) return [null, null];
  const filename = parseImgInf(path.join(kaAssetsDir, "weapon", "img.inf")).get(equip.img);
  if (!filename) return [null, null];
  const png = path.join(kaAssetsDir, "weapon", filename);
  const opt = path.join(kaAssetsDir, "weapon", `${path.parse(filename).name}.opt`);
  return [fs.existsSync(png) ? png : null, fs.existsSync(opt) ? opt : null];
}

function resolveLayerAsset(job: JobRow, variant: number, op: SebOp): [string | null, string | null, boolean] {
  switch (op.type) {
    case 0: {
      const png = path.join(kaAssetsDir, "shadow", "shadow.png");
      const opt = path.join(kaAssetsDir, "shadow", "shadow.opt");
      return [fs.existsSync(png) ? png : null, fs.existsSync(opt) ? opt : null, false];
    }
    case 1: {
      const [dir, filename] = resolvePart(job.resBody, job.imgBodys, variant);
      return assetFromDir(dir, filename, false);
    }
    case 2: {
      const [dir, filename] = resolvePart(job.resFoot, job.imgFoots, variant);
      return assetFromDir(dir, filename, false);
    }
    case 3:
      return [null, null, false];
    case 4: {
      const idx = job.imgHeads[variant] ?? null;
      const filename = idx != null && idx >= 0 ? parseImgInf(path.join(kaAssetsDir, "face", "img.inf")).get(idx) ?? null : null;
      return assetFromDir("face", filename, false);
    }
    case 5:
      return assetFromDir("mouth", "mouth_00.png", false);
    case 6:
      return assetFromDir("eye", "eye_00.png", false);
    case 7: {
      const [, bodyFile] = resolvePart(job.resBody, job.imgBodys, variant);
      const gender = bodyFile?.startsWith("w_") ? "w" : "m";
      return assetFromDir("hair", `hair_${gender}_00.png`, true);
    }
    case 8:
      return [null, null, true];
    case 10: {
      const [dir, filename] = resolvePart(job.resHand, job.imgHands, variant);
      return assetFromDir(dir, filename, false);
    }
    case 11: {
      const [png, opt] = resolveWeaponSprite(job.weapon);
      return [png, opt, !opt];
    }
    case 12: {
      const [png, opt] = resolveWeaponSprite(job.shield);
      return [png, opt, !opt];
    }
    default:
      return [null, null, false];
  }
}

function assetFromDir(dir: string | null, filename: string | null, strip: boolean): [string | null, string | null, boolean] {
  if (!dir || !filename) return [null, null, strip];
  const png = path.join(kaAssetsDir, dir, filename);
  const opt = path.join(kaAssetsDir, dir, `${path.parse(filename).name}.opt`);
  return [fs.existsSync(png) ? png : null, fs.existsSync(opt) ? opt : null, strip];
}

function poseRefs(ops: SebOp[]): [number, number, number] {
  const body = ops.find((op) => op.type === 1);
  const shadow = ops.find((op) => op.type === 0);
  const bodyOx = body?.ox ?? 0;
  const bodyOy = body?.oy ?? 0;
  return [bodyOx, bodyOy, shadow?.oy ?? bodyOy];
}

function poseExtents(ops: SebOp[], bodyOx: number, refOy: number): [number, number, number, number] {
  let minX = 0;
  let minY = 0;
  let maxX = 24;
  let maxY = 30;
  for (const op of ops) {
    const dx = op.ox - bodyOx;
    const dy = op.oy - refOy;
    minX = Math.min(minX, dx);
    minY = Math.min(minY, dy);
    maxX = Math.max(maxX, dx + op.w);
    maxY = Math.max(maxY, dy + op.h);
  }
  return [minX, minY, maxX, maxY];
}

function createCanvas(width: number, height: number): RgbaImage {
  return { width, height, data: Buffer.alloc(width * height * 4) };
}

function alphaPaste(dest: RgbaImage, src: RgbaImage, srcX: number, srcY: number, w: number, h: number, destX: number, destY: number, mirrorX: boolean): void {
  for (let y = 0; y < h; y += 1) {
    const dy = destY + y;
    if (dy < 0 || dy >= dest.height) continue;
    const sy = srcY + y;
    if (sy < 0 || sy >= src.height) continue;
    for (let x = 0; x < w; x += 1) {
      const dx = destX + x;
      if (dx < 0 || dx >= dest.width) continue;
      const sx = srcX + (mirrorX ? w - 1 - x : x);
      if (sx < 0 || sx >= src.width) continue;
      const si = (sy * src.width + sx) * 4;
      const alpha = src.data[si + 3] ?? 0;
      if (alpha === 0) continue;
      const di = (dy * dest.width + dx) * 4;
      if (alpha === 255) {
        dest.data[di] = src.data[si] ?? 0;
        dest.data[di + 1] = src.data[si + 1] ?? 0;
        dest.data[di + 2] = src.data[si + 2] ?? 0;
        dest.data[di + 3] = 255;
        continue;
      }
      const inv = 255 - alpha;
      dest.data[di] = Math.round(((src.data[si] ?? 0) * alpha + (dest.data[di] ?? 0) * inv) / 255);
      dest.data[di + 1] = Math.round(((src.data[si + 1] ?? 0) * alpha + (dest.data[di + 1] ?? 0) * inv) / 255);
      dest.data[di + 2] = Math.round(((src.data[si + 2] ?? 0) * alpha + (dest.data[di + 2] ?? 0) * inv) / 255);
      dest.data[di + 3] = Math.min(255, alpha + Math.round(((dest.data[di + 3] ?? 0) * inv) / 255));
    }
  }
}

function blitOpt(canvas: RgbaImage, pngPath: string, optPath: string, vState: number, uFrame: number, xOffset: number, yOffset: number, layerType: number, mirrorX: boolean): void {
  const src = readImage(pngPath);
  if (!src) return;
  const slots = decodeOpt(optPath, src);
  let slot = slots.get(optKey(vState, uFrame));
  if (!slot && vState !== 0 && layerType !== 12) slot = slots.get(optKey(0, uFrame));
  if (!slot || slot.destX == null || slot.destY == null || slot.srcX == null || slot.srcY == null || slot.w == null || slot.h == null) return;
  const pasteX = mirrorX ? (slot.cellW ?? 24) - slot.destX - slot.w : slot.destX;
  alphaPaste(canvas, src, slot.srcX, slot.srcY, slot.w, slot.h, pasteX + xOffset, slot.destY + yOffset, mirrorX);
}

function blitStrip(canvas: RgbaImage, pngPath: string, op: SebOp, xOffset: number, yOffset: number): void {
  const src = readImage(pngPath);
  if (!src) return;
  alphaPaste(canvas, src, op.u * op.w, op.v * op.h, op.w, op.h, xOffset, yOffset, false);
}

function scaleNearest(image: RgbaImage, scale: number): RgbaImage {
  if (scale <= 1) return image;
  const out = createCanvas(image.width * scale, image.height * scale);
  for (let y = 0; y < out.height; y += 1) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < out.width; x += 1) {
      const sx = Math.floor(x / scale);
      const si = (sy * image.width + sx) * 4;
      const di = (y * out.width + x) * 4;
      out.data[di] = image.data[si] ?? 0;
      out.data[di + 1] = image.data[si + 1] ?? 0;
      out.data[di + 2] = image.data[si + 2] ?? 0;
      out.data[di + 3] = image.data[si + 3] ?? 0;
    }
  }
  return out;
}

function encodePng(image: RgbaImage): Buffer {
  return PNG.sync.write({ width: image.width, height: image.height, data: image.data });
}

export function renderJobPreview(query: QueryMap): Buffer {
  const jobId = toInt(firstQuery(query, "jobId", "0"), 0);
  const variant = clamp(toInt(firstQuery(query, "variant", "1"), 1), 0, 2);
  const scale = clamp(toInt(firstQuery(query, "scale", "8"), 8), 1, 16);
  const poseFrame = clamp(toInt(firstQuery(query, "poseFrame", "0"), 0), 0, 3);
  const jobBase = loadJobs().find((job) => job.id === jobId);
  if (!jobBase) throw new Error(`jobId ${jobId} not found`);

  const job: JobRow = { ...jobBase };
  const weaponOverride = firstQuery(query, "weaponId", "");
  const shieldOverride = firstQuery(query, "shieldId", "");
  if (weaponOverride !== "") job.weapon = toInt(weaponOverride, -1);
  if (shieldOverride !== "") job.shield = toInt(shieldOverride, -1);

  const hasEquipment = (job.weapon != null && job.weapon >= 0) || (job.shield != null && job.shield >= 0);
  const equipStateRaw = firstQuery(query, "equipState", "front-right");
  const equipState = ({ front: "right", "front-right": "right", menu: "right", back: "up", "back-facing": "up" } as Record<string, string>)[equipStateRaw] ?? equipStateRaw;
  const sebName = equipState === "up" ? "equip_wait_up.seb" : hasEquipment ? "equip_wait_right.seb" : "wait_right.seb";
  const shieldCell = firstQuery(query, "shieldCell", "auto");

  let drawOps = parseSeb(sebName, poseFrame);
  if (!drawOps.some((op) => op.type === 1)) drawOps = parseSeb("wait_right.seb", poseFrame);
  const [bodyOx, , refOy] = poseRefs(drawOps);

  const extentValues: Array<[number, number, number, number]> = [];
  for (let frame = 0; frame < 4; frame += 1) {
    let extentOps = parseSeb(sebName, frame);
    if (!extentOps.some((op) => op.type === 1)) extentOps = parseSeb("wait_right.seb", frame);
    const [extentBodyOx, , extentRefOy] = poseRefs(extentOps);
    extentValues.push(poseExtents(extentOps, extentBodyOx, extentRefOy));
  }

  const minX = Math.min(...extentValues.map((extent) => extent[0]));
  const minY = Math.min(...extentValues.map((extent) => extent[1]));
  const maxX = Math.max(...extentValues.map((extent) => extent[2]));
  const maxY = Math.max(...extentValues.map((extent) => extent[3]));
  const originX = -minX;
  const originY = -minY;
  const canvas = createCanvas(maxX - minX, maxY - minY);

  let shieldDrawn = false;
  for (const op of drawOps) {
    if (op.type === 12) {
      if (shieldDrawn) continue;
      shieldDrawn = true;
    }
    const [png, opt, isStrip] = resolveLayerAsset(job, variant, op);
    if (!png) continue;
    const layerX = op.ox - bodyOx + originX;
    const layerY = op.oy - refOy + originY;
    if (isStrip || !opt) {
      blitStrip(canvas, png, op, layerX, layerY);
    } else {
      let vUse = op.v;
      if (op.type === 12 && shieldCell !== "auto") vUse = toInt(shieldCell, op.v);
      blitOpt(canvas, png, opt, vUse, op.u, layerX, layerY, op.type, op.type === 12 && equipState === "right");
    }
  }

  return encodePng(scaleNearest(canvas, scale));
}

export function renderJobPreviewByName(query: QueryMap): Buffer {
  const jobName = firstQuery(query, "jobName", "");
  const rank = firstQuery(query, "rank", "");
  if (!jobName) throw new Error("jobName is required");

  const lowerJobName = jobName.toLowerCase();
  const jobs = loadJobs();
  let job = jobs.find((entry) => entry.name === jobName) ?? null;
  if (!job && rank) {
    for (const candidate of [`${rank} Rank ${jobName}`, `${rank} Grade ${jobName}`]) {
      job = jobs.find((entry) => entry.name === candidate) ?? null;
      if (job) break;
    }
  }
  if (!job) {
    const suffix = ` ${lowerJobName}`;
    job = jobs.find((entry) => entry.name.toLowerCase().endsWith(suffix)) ?? null;
  }
  if (!job) throw new Error(`job not found: ${jobName}${rank ? ` (rank=${rank})` : ""}`);

  const equipList = loadEquip();
  const weaponName = firstQuery(query, "weaponName", "");
  const shieldName = firstQuery(query, "shieldName", "");
  const weapon = weaponName ? equipList.find((entry) => entry.name === weaponName) : null;
  const shield = shieldName ? equipList.find((entry) => entry.name === shieldName) : null;

  return renderJobPreview({
    ...query,
    jobId: String(job.id),
    weaponId: String(weapon?.id ?? -1),
    shieldId: String(shield?.id ?? -1),
  });
}
