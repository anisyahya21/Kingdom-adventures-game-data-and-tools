// Coalesce concurrent readers only; completed responses are never cached.
// Each consumer gets its own body so account-sync errors retain their meaning.
const pending = new Map<string, Promise<Response>>();
export async function requestSession(url: string): Promise<Response> {
  let request = pending.get(url);
  if (!request) {
    request = fetch(url, { credentials: "include", cache: "no-store" });
    pending.set(url, request);
    const release = () => { if (pending.get(url) === request) pending.delete(url); };
    void request.then(release, release);
  }
  return (await request).clone();
}
