import manifest from "@/game-data/combat-sounds.json";
import type { BattleReplayEvent } from "@/lib/battle-replay-result";

export const COMBAT_SOUND_DEFAULT_VOLUME = 127 / 255;

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
  private loading: Promise<void> | null = null;
  private closed = false;
  private lastPlayed = new Map<number, number>();

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
      gain.gain.value = COMBAT_SOUND_DEFAULT_VOLUME;
      source.connect(gain).connect(this.context.destination);
      source.onended = () => { if (this.active.get(id) === source) this.active.delete(id); source.disconnect(); gain.disconnect(); };
      this.active.set(id, source);
      source.start();
    }
  }

  stop(): void {
    for (const source of this.active.values()) source.stop();
    this.active.clear();
    this.lastPlayed.clear();
  }

  close(): void {
    this.closed = true;
    this.stop();
    void this.context?.close();
    this.buffers.clear();
  }
}
