// Share static resources across map mounts. Failed loads remain retryable and
// the entry bound prevents a browsing session from retaining every asset.
export function createResourceCache<T>(limit: number, shouldRetain: (value: T) => boolean = () => true) {
  const entries = new Map<string, Promise<T>>();
  return (key: string, load: () => Promise<T>): Promise<T> => {
    const existing = entries.get(key);
    if (existing) {
      entries.delete(key);
      entries.set(key, existing);
      return existing;
    }
    const pending = load();
    entries.set(key, pending);
    if (entries.size > limit) entries.delete(entries.keys().next().value!);
    void pending.then(value => {
      if (!shouldRetain(value) && entries.get(key) === pending) entries.delete(key);
    }).catch(() => {
      if (entries.get(key) === pending) entries.delete(key);
    });
    return pending;
  };
}
