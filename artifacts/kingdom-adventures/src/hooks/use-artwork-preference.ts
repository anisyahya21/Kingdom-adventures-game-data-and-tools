import { useSyncExternalStore } from "react";

const KEY = "ka_home_game_artwork_v1";
function readSaved() {
  try { return typeof window !== "undefined" && JSON.parse(localStorage.getItem(KEY) ?? "false") === true; }
  catch { return false; }
}
let gameArtwork = readSaved();
const listeners = new Set<() => void>();
function notify() { for (const listener of listeners) listener(); }
function onStorage(event: StorageEvent) {
  if (event.key !== KEY && event.key !== null) return;
  const saved = readSaved();
  if (saved !== gameArtwork) { gameArtwork = saved; notify(); }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}
function setGameArtwork(next: boolean | ((previous: boolean) => boolean)) {
  const value = typeof next === "function" ? next(gameArtwork) : next;
  if (value === gameArtwork) return;
  gameArtwork = value;
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* Retain this session's choice. */ }
  notify();
}
export function useArtworkPreference(): [boolean, typeof setGameArtwork] {
  return [useSyncExternalStore(subscribe, () => gameArtwork, () => false), setGameArtwork];
}
