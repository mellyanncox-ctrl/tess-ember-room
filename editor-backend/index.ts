// Ember Room editor backend (Supabase Edge Function "site-editor").
// Checks the editor password, then reads and writes page content in the GitHub repo.
// Secrets (set in Supabase): GITHUB_TOKEN (fine-grained, Contents read/write on the repo), EDITOR_PASSWORD.
// built-in base64 helpers (no outside libraries)
function encodeBase64(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function decodeBase64(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const REPO = Deno.env.get("GITHUB_REPO") ?? "mellyanncox-ctrl/tess-ember-room";
const BRANCH = Deno.env.get("GITHUB_BRANCH") ?? "main";
const GH = Deno.env.get("GITHUB_TOKEN") ?? "";
const PASS = Deno.env.get("EDITOR_PASSWORD") ?? ""; // starter password, used until Tess sets her own
const SB = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AUTH_NAME = "tess"; // row in public.editor_auth; delete it to go back to the starter password
const ITER = 100000;
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
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
type Auth = { hash: string; salt: string; iterations: number } | null;
async function getAuth(): Promise<Auth> {
  const r = await fetch(`${SB}/rest/v1/editor_auth?name=eq.${AUTH_NAME}&select=hash,salt,iterations`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  if (!r.ok) throw new Error("auth lookup failed");
  const rows = await r.json();
  return rows[0] ?? null;
}
async function pbkdf2(pw: string, salt: string, iterations: number) {
  const k = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations }, k, 256));
}
async function passwordOk(pw: unknown, auth: Auth) {
  if (typeof pw !== "string" || !pw) return false;
  if (auth) return same(await pbkdf2(pw, auth.salt, auth.iterations), auth.hash);
  return same(pw, PASS);
}
async function hmac(data: string, auth: Auth) {
  // changing the password changes this key, which logs out every old session
  const key = await crypto.subtle.importKey("raw", enc.encode("ember-editor:" + GH + ":" + PASS + ":" + (auth?.hash ?? "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function makeToken(auth: Auth) {
  const body = btoa(JSON.stringify({ exp: Date.now() + 1000 * 60 * 60 * 24 * 30 }));
  return body + "." + (await hmac(body, auth));
}
async function checkToken(t: unknown, auth: Auth) {
  if (typeof t !== "string" || !t.includes(".")) return false;
  const [body, sig] = t.split(".");
  if (!same(sig, await hmac(body, auth))) return false;
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
  let auth: Auth;
  try { auth = await getAuth(); } catch { return send(503, { error: "The editor is waking up. Try again in a moment." }); }

  if (action === "login") {
    if (await passwordOk(body.password, auth)) return send(200, { token: await makeToken(auth), must_change: !auth });
    await new Promise((r) => setTimeout(r, 1200));
    return send(401, { error: "That password didn't match." });
  }
  if (!(await checkToken(body.token, auth))) return send(401, { error: "Please log in again." });

  if (action === "status") return send(200, { must_change: !auth });

  if (action === "set_password") {
    if (!(await passwordOk(body.current, auth))) { await new Promise((r) => setTimeout(r, 1200)); return send(400, { error: "Your current password didn't match." }); }
    const next = body.next;
    if (typeof next !== "string" || next.length < 8) return send(400, { error: "Please use at least 8 characters." });
    if (next.length > 200) return send(400, { error: "That password is too long." });
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
    const row = { name: AUTH_NAME, hash: await pbkdf2(next, salt, ITER), salt, iterations: ITER, updated_at: new Date().toISOString() };
    const w = await fetch(`${SB}/rest/v1/editor_auth?on_conflict=name`, { method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) });
    if (!w.ok) return send(502, { error: "Couldn't save your new password. Please try again." });
    return send(200, { ok: true, token: await makeToken(row) });
  }

  if (action === "history") {
    if (!allowed(body.path, WRITABLE)) return send(403, { error: "Not allowed" });
    const r = await gh(`commits?sha=${BRANCH}&path=${encodeURIComponent(body.path)}&per_page=20`);
    if (!r.ok) return send(r.status, { error: "Couldn't load earlier versions" });
    return send(200, { versions: r.json.map((c: any) => ({ sha: c.sha, date: c.commit.committer.date, message: c.commit.message.split("\n")[0] })) });
  }

  if (action === "list") {
    if (!allowed(body.dir, READABLE)) return send(403, { error: "Not allowed" });
    const r = await gh(`contents/${body.dir}?ref=${BRANCH}`);
    if (!r.ok) return send(r.status, { error: "Couldn't list files" });
    return send(200, { files: r.json.filter((f: any) => f.type === "file").map((f: any) => ({ name: f.name, path: f.path, sha: f.sha })) });
  }
  if (action === "read") {
    if (!allowed(body.path, READABLE)) return send(403, { error: "Not allowed" });
    const ref = typeof body.ref === "string" && /^[0-9a-f]{40}$/.test(body.ref) ? body.ref : BRANCH;
    const r = await gh(`contents/${body.path}?ref=${ref}`);
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
