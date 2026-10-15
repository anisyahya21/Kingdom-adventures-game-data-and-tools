import manifest from "@/game-data/combat-sounds.json";
import rules from "@/game-data/combat-sound-rules.json";
import type { BattleReplayEvent } from "@/lib/battle-replay-result";

export const COMBAT_SOUND_DEFAULT_VOLUME = rules.gains.android[127];

/** Native integer settings, with original ARM64 gain curves for Android/iPhone and Steam. */
export function combatSoundGain(volume: number, options: { baseVolume?: number; muted?: boolean; master?: boolean; platform?: "android" | "steam" } = {}): number {
  if (options.muted || options.master === false) return 0;
  const integer = (value: number) => Math.max(0, Math.min(255, Math.trunc(Number.isFinite(value) ? value : 127)));
  const curve = rules.gains[options.platform ?? "android"][integer(volume)];
  return Math.max(0, Math.min(1, Math.fround(Math.fround(curve * integer(options.baseVolume ?? 255)) / 255)));
}

type SoundRect = { rect: number[]; flip: boolean };
/** Seb._load's all-frame rectangle; GetBRect applies the native even-pixel mirror pivot. */
export function combatSoundOnscreen(input: { humanClip?: number | null; monsterClip?: string; mirror?: { u: boolean; v: boolean }; x: number; y: number; width: number; height: number }): boolean {
  const record: SoundRect | undefined = input.monsterClip
    ? (rules.monsterBounds as Record<string, SoundRect>)[input.monsterClip]
    : (rules.humanBounds as Record<string, SoundRect>)[String(input.humanClip)];
  if (!record || ![input.x, input.y, input.width, input.height].every(Number.isFinite)) return false;
  const [left, top, width, height] = record.rect;
  const x = Math.trunc(input.x) + ((record.flip !== Boolean(input.mirror?.u)) ? -2 * Math.trunc(width / 2) - left : left);
  const y = Math.trunc(input.y) + (input.mirror?.v ? -2 * Math.trunc(height / 2) - top : top);
  // KairoMath.CheckHitRect 0x242b9ac includes edge contact, including zero-sized rectangles.
  return x + width >= 0 && x <= input.width && y + height >= 0 && y <= input.height;
}

export function combatSoundRequests(events: BattleReplayEvent[], afterTick: number, tick: number,
  isOnscreen?: (event: BattleReplayEvent) => boolean): number[] {
  const updates = new Map<number, Map<number, number>>();
  events.forEach((event, order) => {
    if (event.tick <= afterTick || event.tick > tick ||
        (event.kind !== "sound_request" && event.kind !== "state_sound") || event.passed === false) return;
    // AppData.PlaySe(entity) queues the defender cue only inside the displayed view.
    if (event.requiresScreen === true && !isOnscreen?.(event)) return;
    const id = event.sound;
    if (typeof id !== "number" || !(String(id) in manifest.sounds)) return;
    let requests = updates.get(event.tick);
    if (!requests) updates.set(event.tick, requests = new Map());
    // PlaySe uses one counter slot per ID; newer requests overwrite that slot.
    requests.set(id, id === 22 || id === 23 ? 1 : order + 1);
  });
  return [...updates.values()].flatMap((requests) => [...requests].sort((a,b) => a[1]-b[1] || a[0]-b[0]).map(([id]) => id));
}

/** Original samples, triggered only by recorded requests during forward playback. */
export class CombatSoundPlayer {
  private context: AudioContext | null = null;
  private buffers = new Map<number, AudioBuffer>();
  private active = new Map<number, AudioBufferSourceNode>();
  private gains = new Map<number, GainNode>();
  private volume = 127;
  private loading: Promise<void> | null = null;
  private closed = false;
  private lastPlayed = new Map<number, number>();

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(255, Math.trunc(Number.isFinite(volume) ? volume : 127)));
    for (const gain of this.gains.values()) gain.gain.value = combatSoundGain(this.volume);
  }

  async prepare(): Promise<void> {
    if (this.closed) throw new Error("Sound player closed");
    this.context ??= new AudioContext();
    await this.context.resume(); // Called from the user's Sound button gesture.
    this.loading ??= Promise.all(Object.entries(manifest.sounds).map(async ([id, sound]) => {
      const response = await fetch(sound.file);
      if (!response.ok) throw new Error(`Could not load ${sound.name}`);
      const buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
      if (!this.closed) this.buffers.set(Number(id), buffer);
    })).then(() => undefined).catch((error) => { this.loading = null; throw error; });
    await this.loading;
  }

  play(ids: number[]): void {
    if (!this.context || this.context.state !== "running") return;
    for (const id of ids) {
      const buffer = this.buffers.get(id);
      if (!buffer) continue;
      // AppData.PlaySeFinal 0x1666fcc drops requests at <=150 ms since dispatch.
      const now = Math.trunc(this.context.currentTime * 1000);
      const previous = this.lastPlayed.get(id);
      if (previous !== undefined && now - previous <= 150) continue;
      this.lastPlayed.set(id, now);
      // SoundOGG.Play keeps an already-playing source for the same sound object.
      if (this.active.has(id)) continue;
      // SoundPlayer.Init creates four ports; GetPort drops a fifth active clip.
      if (this.active.size >= 4) continue;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      const gain = this.context.createGain();
      gain.gain.value = combatSoundGain(this.volume);
      source.connect(gain).connect(this.context.destination);
      source.onended = () => { if (this.active.get(id) === source) { this.active.delete(id); this.gains.delete(id); } source.disconnect(); gain.disconnect(); };
      this.active.set(id, source);
      this.gains.set(id, gain);
      source.start();
    }
  }

  stop(): void {
    for (const source of this.active.values()) source.stop();
    this.active.clear();
    this.gains.clear();
    this.lastPlayed.clear();
  }

  close(): void {
    this.closed = true;
    this.stop();
    void this.context?.close();
    this.buffers.clear();
  }
}
