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

type SebOp = {
  type: number;
  u: number;
  v: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
};

type Slot = {
  status: string;
  destX?: number;
  destY?: number;
  srcX?: number;
  srcY?: number;
  w?: number;
  h?: number;
  recovered?: boolean;
};

type OptEntry = {
  cellW: number;
  cellH: number;
  slots: Record<string, Slot>;
};

type SpriteDirRules = {
  inf: Record<string, Record<string, string>>;
  opts: Record<string, OptEntry>;
};

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
  img: number | null;
};

type CharacterRules = {
  version: number;
  spriteBase: string;
  dirs: Record<string, SpriteDirRules>;
  poses: Record<string, SebOp[][]>;
  jobs: JobRow[];
  equips: EquipRow[];
};

type AssetRef = {
  dir: string;
  filename: string;
  strip: boolean;
};

export type CharacterRenderParams = {
  jobName: string;
  rank?: string | null;
  variant: 1 | 2;
  equipState: "right" | "up";
  weaponName?: string | null;
  shieldName?: string | null;
  scale: number;
  poseFrame: 0 | 1 | 2 | 3;
};

let rulesPromise: Promise<CharacterRules> | null = null;
const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadCharacterRules(): Promise<CharacterRules> {
  if (!rulesPromise) {
    rulesPromise = fetch("/character_sprites/character-rules.json")
      .then((response) => {
        if (!response.ok) throw new Error(`character rules ${response.status}`);
        return response.json() as Promise<CharacterRules>;
      });
  }
  return rulesPromise;
}

function spriteUrl(rules: CharacterRules, dir: string, filename: string): string {
  return `${rules.spriteBase}/${encodeURIComponent(dir)}/${filename.split("/").map(encodeURIComponent).join("/")}`;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  const cached = imageCache.get(url);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
  imageCache.set(url, promise);
  return promise;
}

function optKey(v: number, u: number): string {
  return `${v},${u}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function basename(filename: string): string {
  const leaf = filename.split(/[\\/]/).pop() ?? filename;
  return leaf.replace(/\.[^.]+$/, "");
}

function infLookup(rules: CharacterRules, dir: string, idx: number | null): string | null {
  if (idx == null || idx < 0) return null;
  return rules.dirs[dir]?.inf?.img?.[String(idx)] ?? null;
}

function hasOptRules(rules: CharacterRules, dir: string, filename: string | null): boolean {
  if (!filename) return false;
  return !!rules.dirs[dir]?.opts?.[basename(filename)];
}

function findJob(rules: CharacterRules, jobName: string, rank?: string | null): JobRow | null {
  const lowerJobName = jobName.toLowerCase();
  let job = rules.jobs.find((entry) => entry.name === jobName) ?? null;
  if (!job && rank) {
    for (const candidate of [`${rank} Rank ${jobName}`, `${rank} Grade ${jobName}`]) {
      job = rules.jobs.find((entry) => entry.name === candidate) ?? null;
      if (job) break;
    }
  }
  if (!job) {
    const suffix = ` ${lowerJobName}`;
    job = rules.jobs.find((entry) => entry.name.toLowerCase().endsWith(suffix)) ?? null;
  }
  return job;
}

function equipById(rules: CharacterRules, id: number | null): EquipRow | null {
  if (id == null || id < 0) return null;
  return rules.equips.find((entry) => entry.id === id) ?? null;
}

function equipByName(rules: CharacterRules, name?: string | null): EquipRow | null {
  if (!name) return null;
  return rules.equips.find((entry) => entry.name === name) ?? null;
}

function resolvePart(rules: CharacterRules, res: number | null, imgIndices: Array<number | null>, variant: number): [string | null, string | null] {
  if (res == null) return [null, null];
  const dir = RES_DIRS[res] ?? null;
  if (!dir) return [null, null];
  const idx = imgIndices[variant] ?? null;
  if (idx == null || idx < 0) return [dir, null];
  return [dir, infLookup(rules, dir, idx)];
}

function assetFromDir(rules: CharacterRules, dir: string | null, filename: string | null, strip: boolean): AssetRef | null {
  if (!dir || !filename) return null;
  return { dir, filename, strip: strip || !hasOptRules(rules, dir, filename) };
}

function resolveWeaponSprite(rules: CharacterRules, equipId: number | null): AssetRef | null {
  const equip = equipById(rules, equipId);
  if (!equip || equip.img == null || equip.img < 0) return null;
  const filename = infLookup(rules, "weapon", equip.img);
  return assetFromDir(rules, "weapon", filename, !filename || !hasOptRules(rules, "weapon", filename));
}

function resolveLayerAsset(rules: CharacterRules, job: JobRow, variant: number, op: SebOp, weaponId: number | null, shieldId: number | null): AssetRef | null {
  switch (op.type) {
    case 0:
      return assetFromDir(rules, "shadow", "shadow.png", false);
    case 1: {
      const [dir, filename] = resolvePart(rules, job.resBody, job.imgBodys, variant);
      return assetFromDir(rules, dir, filename, false);
    }
    case 2: {
      const [dir, filename] = resolvePart(rules, job.resFoot, job.imgFoots, variant);
      return assetFromDir(rules, dir, filename, false);
    }
    case 3:
      return null;
    case 4: {
      const filename = infLookup(rules, "face", job.imgHeads[variant] ?? null);
      return assetFromDir(rules, "face", filename, false);
    }
    case 5:
      return assetFromDir(rules, "mouth", "mouth_00.png", false);
    case 6:
      return assetFromDir(rules, "eye", "eye_00.png", false);
    case 7: {
      const [, bodyFile] = resolvePart(rules, job.resBody, job.imgBodys, variant);
      const gender = bodyFile?.startsWith("w_") ? "w" : "m";
      return assetFromDir(rules, "hair", `hair_${gender}_00.png`, true);
    }
    case 8:
      return null;
    case 10: {
      const [dir, filename] = resolvePart(rules, job.resHand, job.imgHands, variant);
      return assetFromDir(rules, dir, filename, false);
    }
    case 11:
      return resolveWeaponSprite(rules, weaponId);
    case 12:
      return resolveWeaponSprite(rules, shieldId);
    default:
      return null;
  }
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

function getPoseOps(rules: CharacterRules, poseName: string, poseFrame: number): SebOp[] {
  const frame = rules.poses[poseName]?.[poseFrame] ?? [];
  if (frame.some((op) => op.type === 1)) return frame;
  return rules.poses["wait_right.seb"]?.[poseFrame] ?? [];
}

function drawCrop(ctx: CanvasRenderingContext2D, image: HTMLImageElement, srcX: number, srcY: number, w: number, h: number, destX: number, destY: number, mirrorX: boolean): void {
  if (w <= 0 || h <= 0) return;
  if (!mirrorX) {
    ctx.drawImage(image, srcX, srcY, w, h, destX, destY, w, h);
    return;
  }
  ctx.save();
  ctx.translate(destX + w, destY);
  ctx.scale(-1, 1);
  ctx.drawImage(image, srcX, srcY, w, h, 0, 0, w, h);
  ctx.restore();
}

async function blitOpt(ctx: CanvasRenderingContext2D, rules: CharacterRules, asset: AssetRef, vState: number, uFrame: number, xOffset: number, yOffset: number, layerType: number, mirrorX: boolean): Promise<void> {
  const entry = rules.dirs[asset.dir]?.opts?.[basename(asset.filename)];
  if (!entry) return;
  const image = await loadImage(spriteUrl(rules, asset.dir, asset.filename));
  if (!image) return;
  let slot = entry.slots[optKey(vState, uFrame)];
  if (!slot && vState !== 0 && layerType !== 12) slot = entry.slots[optKey(0, uFrame)];
  if (!slot || slot.destX == null || slot.destY == null || slot.srcX == null || slot.srcY == null || slot.w == null || slot.h == null) return;
  const pasteX = mirrorX ? entry.cellW - slot.destX - slot.w : slot.destX;
  drawCrop(ctx, image, slot.srcX, slot.srcY, slot.w, slot.h, pasteX + xOffset, slot.destY + yOffset, mirrorX);
}

async function blitStrip(ctx: CanvasRenderingContext2D, rules: CharacterRules, asset: AssetRef, op: SebOp, xOffset: number, yOffset: number): Promise<void> {
  const image = await loadImage(spriteUrl(rules, asset.dir, asset.filename));
  if (!image) return;
  drawCrop(ctx, image, op.u * op.w, op.v * op.h, op.w, op.h, xOffset, yOffset, false);
}

export async function renderCharacterPreview(canvas: HTMLCanvasElement, params: CharacterRenderParams): Promise<boolean> {
  const rules = await loadCharacterRules();
  const job = findJob(rules, params.jobName, params.rank);
  if (!job) return false;

  const variant = clamp(params.variant, 0, 2);
  let weaponId = job.weapon;
  let shieldId = job.shield;
  if (params.weaponName != null) weaponId = equipByName(rules, params.weaponName)?.id ?? -1;
  if (params.shieldName != null) shieldId = equipByName(rules, params.shieldName)?.id ?? -1;

  const hasEquipment = (weaponId != null && weaponId >= 0) || (shieldId != null && shieldId >= 0);
  const poseName = params.equipState === "up" ? "equip_wait_up.seb" : hasEquipment ? "equip_wait_right.seb" : "wait_right.seb";
  const poseFrame = clamp(params.poseFrame, 0, 3);
  const drawOps = getPoseOps(rules, poseName, poseFrame);
  if (!drawOps.length) return false;

  const [bodyOx, , refOy] = poseRefs(drawOps);
  const extentValues: Array<[number, number, number, number]> = [];
  for (let frame = 0; frame < 4; frame += 1) {
    const extentOps = getPoseOps(rules, poseName, frame);
    const [extentBodyOx, , extentRefOy] = poseRefs(extentOps);
    extentValues.push(poseExtents(extentOps, extentBodyOx, extentRefOy));
  }

  const minX = Math.min(...extentValues.map((extent) => extent[0]));
  const minY = Math.min(...extentValues.map((extent) => extent[1]));
  const maxX = Math.max(...extentValues.map((extent) => extent[2]));
  const maxY = Math.max(...extentValues.map((extent) => extent[3]));
  const base = document.createElement("canvas");
  base.width = Math.max(1, maxX - minX);
  base.height = Math.max(1, maxY - minY);
  const baseCtx = base.getContext("2d");
  if (!baseCtx) return false;
  baseCtx.imageSmoothingEnabled = false;

  const originX = -minX;
  const originY = -minY;
  let shieldDrawn = false;
  for (const op of drawOps) {
    if (op.type === 12) {
      if (shieldDrawn) continue;
      shieldDrawn = true;
    }
    const asset = resolveLayerAsset(rules, job, variant, op, weaponId, shieldId);
    if (!asset) continue;
    const layerX = op.ox - bodyOx + originX;
    const layerY = op.oy - refOy + originY;
    if (asset.strip) {
      await blitStrip(baseCtx, rules, asset, op, layerX, layerY);
    } else {
      await blitOpt(baseCtx, rules, asset, op.v, op.u, layerX, layerY, op.type, op.type === 12 && params.equipState === "right");
    }
  }

  const scale = clamp(params.scale, 1, 16);
  canvas.width = base.width * scale;
  canvas.height = base.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
  return true;
}
