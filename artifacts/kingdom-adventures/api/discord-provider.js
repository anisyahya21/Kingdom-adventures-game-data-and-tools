import { createHmac, timingSafeEqual } from "node:crypto";

const seen = new Map();
const validPath = (path) => ["/oauth2/token", "/oauth2/token/revoke", "/users/@me", "/users/@me/channels", "/gateway"].includes(path) || /^\/channels\/\d{5,25}\/messages$/.test(path);

// Private server-to-server transport. This is never a browser-facing OAuth API.
// Credentials, tokens and Discord response bodies must not be logged.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const secret = process.env.DISCORD_HTTP_RELAY_SECRET;
  if (!secret) return res.status(503).json({ error: "Discord transport unavailable" });
  const timestamp = String(req.headers["x-ka-discord-time"] || "");
  const nonce = String(req.headers["x-ka-discord-nonce"] || "");
  const signature = String(req.headers["x-ka-discord-signature"] || "");
  if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 60000 || !/^[a-f0-9]{32}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return res.status(401).json({ error: "Unauthorized" });
  let raw;
  if (Buffer.isBuffer(req.body)) raw = req.body.toString("utf8");
  else if (typeof req.body === "string") raw = req.body;
  else if (req.body) raw = JSON.stringify(req.body);
  else {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 65536) return res.status(413).json({ error: "Request too large" }); chunks.push(chunk); }
    raw = Buffer.concat(chunks).toString("utf8");
  }
  if (Buffer.byteLength(raw) > 65536) return res.status(413).json({ error: "Request too large" });
  const expected = createHmac("sha256", secret).update(`${timestamp}.${nonce}.${raw}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return res.status(401).json({ error: "Unauthorized" });
  for (const [key, expiry] of seen) if (expiry < Date.now()) seen.delete(key);
  if (seen.has(nonce)) return res.status(409).json({ error: "Request already used" });
  if (seen.size >= 2000) return res.status(503).json({ error: "Transport busy" });
  seen.set(nonce, Date.now() + 60000);
  let input;
  try { input = JSON.parse(raw); } catch { return res.status(400).json({ error: "Invalid request" }); }
  if (!input || typeof input !== "object") return res.status(400).json({ error: "Invalid request" });
  const method = input.path === "/users/@me" || input.path === "/gateway" ? "GET" : "POST";
  if (!validPath(input.path) || input.method !== method || (input.body !== undefined && typeof input.body !== "string")) return res.status(400).json({ error: "Invalid request" });
  const headers = { Accept: "application/json", "User-Agent": "KingdomAdventurersCommunityTools/1.0 (+https://kingdom-adventures-community-tools.vercel.app)" };
  if (typeof input.authorization === "string") headers.Authorization = input.authorization;
  if (typeof input.contentType === "string") headers["Content-Type"] = input.contentType;
  try {
    const upstream = await fetch(`https://discord.com/api/v10${input.path}`, { method, headers, ...(method === "POST" ? { body: input.body } : {}), redirect: "manual", signal: AbortSignal.timeout(15000) });
    for (const key of ["content-type", "retry-after", "x-ratelimit-scope", "x-ratelimit-global", "x-ratelimit-reset-after"]) { const value = upstream.headers.get(key); if (value) res.setHeader(key, value); }
    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.length > 1048576 || upstream.status >= 300 && upstream.status < 400) return res.status(502).json({ error: "Unexpected provider response" });
    res.status(upstream.status).end(body);
  } catch { res.status(502).json({ error: "Discord connection unavailable" }); }
}
