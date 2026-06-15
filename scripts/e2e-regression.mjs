import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

const baseUrl = (process.env.E2E_BASE_URL || "http://localhost:4000").replace(/\/$/, "");
const email = process.env.E2E_EMAIL?.trim();
const password = process.env.E2E_PASSWORD ?? "";
const allowAuthSkip = process.env.E2E_ALLOW_AUTH_SKIP === "1";

const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function note(message) {
  notes.push(message);
  console.log(`NOTE ${message}`);
}

async function request(path, init = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...init,
    headers: {
      ...(init.body && !init.headers?.["content-type"] ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { res, body, text };
}

function expectStatus(label, actual, expected) {
  if (actual === expected) pass(`${label}: ${actual}`);
  else fail(`${label}: expected ${expected}, got ${actual}`);
}

function supabaseStorageKey(supabaseUrl) {
  const hostname = new URL(supabaseUrl).hostname;
  return `sb-${hostname.split(".")[0]}-auth-token`;
}

function cookieChunks(name, value, chunkSize = 3180) {
  if (encodeURIComponent(value).length <= chunkSize) return [{ name, value }];
  const chunks = [];
  let remaining = value;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, chunkSize));
    remaining = remaining.slice(chunkSize);
  }
  return chunks.map((chunk, index) => ({ name: `${name}.${index}`, value: chunk }));
}

function sessionCookieHeader(supabaseUrl, session) {
  const storageKey = supabaseStorageKey(supabaseUrl);
  const encoded = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  return cookieChunks(storageKey, encoded)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

async function smokePublicRoutes() {
  const publicRoutes = ["/", "/login", "/projects", "/prompt", "/settings", "/me", "/admin"];
  for (const route of publicRoutes) {
    const { res, text } = await request(route);
    expectStatus(`public route ${route}`, res.status, 200);
    if (text.length < 500) fail(`public route ${route}: response looks too small (${text.length} bytes)`);
  }

  const protectedRoutes = ["/chat", "/image", "/video", "/canvas"];
  for (const route of protectedRoutes) {
    const { res } = await request(route);
    expectStatus(`unauthenticated redirect ${route}`, res.status, 307);
    const location = res.headers.get("location") ?? "";
    if (location === "/projects" || location.endsWith("/projects")) pass(`unauthenticated redirect ${route}: ${location}`);
    else fail(`unauthenticated redirect ${route}: expected /projects, got ${location || "(none)"}`);
  }

  const me = await request("/api/me");
  expectStatus("unauthenticated /api/me", me.res.status, 401);

  const presets = await request("/api/site-prompt-presets?kind=all");
  expectStatus("public prompt presets API", presets.res.status, 200);
  if (Array.isArray(presets.body?.presets)) pass(`public prompt presets API: ${presets.body.presets.length} presets`);
  else fail("public prompt presets API: missing presets array");

  const promptPage = await request("/prompt");
  if (promptPage.text.includes("输入标题、描述或提示词内容")) pass("prompt page search control is rendered");
  else fail("prompt page search control was not found");
}

async function signIn() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  if (!email || !password) {
    if (allowAuthSkip) {
      note("auth checks skipped because E2E_EMAIL/E2E_PASSWORD are not set and E2E_ALLOW_AUTH_SKIP=1");
      return null;
    }
    throw new Error("Set E2E_EMAIL and E2E_PASSWORD for authenticated e2e checks, or E2E_ALLOW_AUTH_SKIP=1 to run public-only checks.");
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error("Supabase signInWithPassword returned no session");
  return sessionCookieHeader(supabaseUrl, data.session);
}

async function smokeAuthenticatedRoutes(cookie) {
  if (!cookie) return;
  const authHeaders = { cookie };

  const me = await request("/api/me", { headers: authHeaders });
  expectStatus("authenticated /api/me", me.res.status, 200);
  if (me.body?.email === email) pass("authenticated /api/me returns the expected user");
  else fail(`authenticated /api/me returned unexpected email: ${me.body?.email ?? "(none)"}`);

  const projectName = `e2e-regression-${new Date().toISOString()}`;
  let projectId = null;
  try {
    const created = await request("/api/projects", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: projectName }),
    });
    expectStatus("authenticated project create", created.res.status, 201);
    projectId = created.body?.id ?? null;
    if (projectId && created.body?.name === projectName) pass(`authenticated project create returned ${projectId}`);
    else fail("authenticated project create did not return the created project");

    if (projectId) {
      const fetched = await request(`/api/projects/${projectId}`, { headers: authHeaders });
      expectStatus("authenticated project fetch", fetched.res.status, 200);
      if (fetched.body?.id === projectId) pass("authenticated project fetch returns created project");
      else fail("authenticated project fetch returned a different project");
    }
  } finally {
    if (projectId) {
      const deleted = await request(`/api/projects/${projectId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      expectStatus("authenticated project cleanup", deleted.res.status, 204);
    }
  }

  const presets = await request("/api/site-prompt-presets?kind=all", { headers: authHeaders });
  expectStatus("authenticated prompt presets API", presets.res.status, 200);
  const firstPreset = Array.isArray(presets.body?.presets) ? presets.body.presets[0] : null;
  if (!firstPreset?.id) {
    fail("authenticated prompt presets API returned no preset to favorite");
    return;
  }

  const favorite = await request("/api/site-prompt-presets/favorites", {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({ presetId: firstPreset.id, isFavorite: true }),
  });
  expectStatus("authenticated prompt preset favorite", favorite.res.status, 200);
  if (favorite.body?.presetId === firstPreset.id && favorite.body?.isFavorite === true) pass("authenticated prompt preset favorite persisted");
  else fail("authenticated prompt preset favorite response did not confirm persistence");

  const unfavorite = await request("/api/site-prompt-presets/favorites", {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({ presetId: firstPreset.id, isFavorite: false }),
  });
  expectStatus("authenticated prompt preset unfavorite cleanup", unfavorite.res.status, 200);
}

try {
  console.log(`Running e2e regression smoke against ${baseUrl}`);
  await smokePublicRoutes();
  const cookie = await signIn();
  await smokeAuthenticatedRoutes(cookie);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (notes.length > 0) {
  console.log(`\nNotes: ${notes.length}`);
  for (const item of notes) console.log(`- ${item}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} e2e regression check(s) failed.`);
  process.exit(1);
}

console.log("\nAll e2e regression checks passed.");
