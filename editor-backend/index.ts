// Ember Room editor backend (Supabase Edge Function "site-editor").
// Checks the editor password, then reads and writes page content in the GitHub repo.
// Secrets (set in Supabase): GITHUB_TOKEN (fine-grained, Contents read/write on the repo), EDITOR_PASSWORD.
import { encodeBase64, decodeBase64 } from "jsr:@std/encoding@1/base64";

const REPO = Deno.env.get("GITHUB_REPO") ?? "mellyanncox-ctrl/tess-ember-room";
const BRANCH = Deno.env.get("GITHUB_BRANCH") ?? "main";
const GH = Deno.env.get("GITHUB_TOKEN") ?? "";
const PASS = Deno.env.get("EDITOR_PASSWORD") ?? "";
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ??
  "https://tess.theserviceedit.com,https://theemberroom.com.au,https://www.theemberroom.com.au,https://tessfowler.com.au,https://www.tessfowler.com.au")
  .split(",").map((s) => s.trim());
const WRITABLE = [
  /^pages\/[a-z0-9][a-z0-9-]*\.md$/,
  /^_data\/(site|practice|faq)\.yml$/,
  /^_posts\/\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*\.md$/,
  /^assets\/img\/uploads\/[a-z0-9][a-z0-9._-]*\.(jpg|jpeg|png|webp)$/,
];
const READABLE = [...WRITABLE, /^pages$/, /^_posts$/];
const enc = new TextEncoder();

function cors(origin: string | null) {
  const ok = origin && ORIGINS.includes(origin) ? origin : ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": ok,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Vary": "Origin",
  };
}
async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode("ember-editor:" + GH + ":" + PASS), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function makeToken() {
  const body = btoa(JSON.stringify({ exp: Date.now() + 1000 * 60 * 60 * 24 * 30 }));
  return body + "." + (await hmac(body));
}
async function checkToken(t: unknown) {
  if (typeof t !== "string" || !t.includes(".")) return false;
  const [body, sig] = t.split(".");
  if (!same(sig, await hmac(body))) return false;
  try { return JSON.parse(atob(body)).exp > Date.now(); } catch { return false; }
}
async function gh(path: string, init: RequestInit = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${GH}`, Accept: "application/vnd.github+json", "User-Agent": "ember-room-editor", "X-GitHub-Api-Version": "2022-11-28", ...(init.headers ?? {}) },
  });
  const text = await r.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { ok: r.ok, status: r.status, json };
}
const allowed = (p: string, list: RegExp[]) => typeof p === "string" && !p.includes("..") && list.some((re) => re.test(p));

Deno.serve(async (req) => {
  const h = { ...cors(req.headers.get("origin")), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  const send = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: h });
  if (req.method !== "POST") return send(405, { error: "Use POST" });
  let body: any;
  try { body = await req.json(); } catch { return send(400, { error: "Bad request" }); }
  const action = body?.action;

  if (action === "ping") return send(200, { ok: true });
  if (!GH || !PASS) return send(500, { error: "The editor isn't set up yet (missing secrets)." });

  if (action === "login") {
    if (typeof body.password === "string" && same(body.password, PASS)) return send(200, { token: await makeToken() });
    await new Promise((r) => setTimeout(r, 1200));
    return send(401, { error: "That password didn't match." });
  }
  if (!(await checkToken(body.token))) return send(401, { error: "Please log in again." });

  if (action === "list") {
    if (!allowed(body.dir, READABLE)) return send(403, { error: "Not allowed" });
    const r = await gh(`contents/${body.dir}?ref=${BRANCH}`);
    if (!r.ok) return send(r.status, { error: "Couldn't list files" });
    return send(200, { files: r.json.filter((f: any) => f.type === "file").map((f: any) => ({ name: f.name, path: f.path, sha: f.sha })) });
  }
  if (action === "read") {
    if (!allowed(body.path, READABLE)) return send(403, { error: "Not allowed" });
    const r = await gh(`contents/${body.path}?ref=${BRANCH}`);
    if (!r.ok) return send(r.status, { error: "Couldn't read " + body.path });
    return send(200, { path: body.path, sha: r.json.sha, content: new TextDecoder().decode(decodeBase64(r.json.content.replace(/\n/g, ""))) });
  }
  if (action === "save") {
    const files = Array.isArray(body.files) ? body.files : [];
    if (!files.length || files.length > 30) return send(400, { error: "Nothing to save" });
    for (const f of files) if (!allowed(f.path, WRITABLE)) return send(403, { error: "Not allowed: " + f.path });
    const message = (typeof body.message === "string" && body.message.slice(0, 120)) || "Website edit";
    const results: any[] = [];
    for (const f of files) {
      // always use the latest sha so two saves in a row never conflict
      const cur = await gh(`contents/${f.path}?ref=${BRANCH}`);
      const sha = cur.ok ? cur.json.sha : undefined;
      if (f.delete) {
        if (!sha) { results.push({ path: f.path, deleted: true }); continue; }
        const d = await gh(`contents/${f.path}`, { method: "DELETE", body: JSON.stringify({ message, sha, branch: BRANCH }) });
        if (!d.ok) return send(502, { error: "Couldn't delete " + f.path, results });
        results.push({ path: f.path, deleted: true });
        continue;
      }
      const content = f.base64 ?? encodeBase64(enc.encode(String(f.content ?? "")));
      const p = await gh(`contents/${f.path}`, { method: "PUT", body: JSON.stringify({ message, content, sha, branch: BRANCH }) });
      if (!p.ok) return send(502, { error: "Couldn't save " + f.path, results });
      results.push({ path: f.path, sha: p.json.content.sha });
    }
    return send(200, { ok: true, results });
  }
  return send(400, { error: "Unknown action" });
});
