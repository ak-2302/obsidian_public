interface Env {
  ASSETS: Fetcher;
  VAULT: R2Bucket;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  PUBLIC_PREFIX: string;
  GITHUB_TOKEN: string;
  GITHUB_WEBHOOK_SECRET: string;
  SYNC_TOKEN: string;
}

type VaultFile = { path: string; sha: string; size: number; contentType: string };
type VaultManifest = { commitSha: string; syncedAt: string; files: VaultFile[] };
type GitTreeEntry = { path: string; mode: string; type: "blob" | "tree"; sha: string; size?: number };

const MANIFEST_KEY = "_system/vault-manifest.json";
const CACHE_SECONDS = 300;

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, { ...init, headers: { "cache-control": "no-store", ...init.headers } });
}

function contentType(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  return ({ md: "text/markdown; charset=utf-8", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf", mp3: "audio/mpeg", mp4: "video/mp4" } as Record<string, string>)[ext ?? ""] ?? "application/octet-stream";
}

function safePath(path: string) {
  return path.length > 0 && !path.startsWith("/") && !path.includes("..") && !path.split("/").some((part) => part.startsWith("."));
}

async function readManifest(env: Env): Promise<VaultManifest | null> {
  const object = await env.VAULT.get(MANIFEST_KEY);
  return object ? object.json<VaultManifest>() : null;
}

async function github(env: Env, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "x-github-api-version": "2022-11-28",
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
  return response;
}

async function syncVault(env: Env) {
  const branch = encodeURIComponent(env.GITHUB_BRANCH || "main");
  const commit = await (await github(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/commits/${branch}`)).json<{ sha: string; commit: { tree: { sha: string } } }>();
  const previous = await readManifest(env);
  if (previous?.commitSha === commit.sha) return { changed: false, manifest: previous };

  const tree = await (await github(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/trees/${commit.commit.tree.sha}?recursive=1`)).json<{ tree: GitTreeEntry[]; truncated: boolean }>();
  if (tree.truncated) throw new Error("リポジトリのツリーが大きすぎるため同期できません。");

  const files = tree.tree
    .filter((entry) => entry.type === "blob" && safePath(entry.path))
    .filter((entry) => !env.PUBLIC_PREFIX || entry.path.startsWith(env.PUBLIC_PREFIX))
    .map((entry) => ({ path: entry.path, sha: entry.sha, size: entry.size ?? 0, contentType: contentType(entry.path) }));
  const oldFiles = new Map(previous?.files.map((file) => [file.path, file]) ?? []);

  for (const file of files) {
    if (oldFiles.get(file.path)?.sha === file.sha) continue;
    const blob = await (await github(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/blobs/${file.sha}`)).json<{ content: string; encoding: string }>();
    if (blob.encoding !== "base64") throw new Error(`未対応のGit blob形式: ${file.path}`);
    const bytes = Uint8Array.from(atob(blob.content.replace(/\n/g, "")), (character) => character.charCodeAt(0));
    await env.VAULT.put(`vault/${file.path}`, bytes, { httpMetadata: { contentType: file.contentType }, customMetadata: { sha: file.sha } });
  }
  const currentPaths = new Set(files.map((file) => file.path));
  const deleted = [...oldFiles.keys()].filter((path) => !currentPaths.has(path));
  if (deleted.length) await env.VAULT.delete(deleted.map((path) => `vault/${path}`));

  const manifest: VaultManifest = { commitSha: commit.sha, syncedAt: new Date().toISOString(), files };
  await env.VAULT.put(MANIFEST_KEY, JSON.stringify(manifest), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
  return { changed: true, manifest };
}

async function validSignature(request: Request, secret: string) {
  const signature = request.headers.get("x-hub-signature-256");
  if (!signature || !secret) return false;
  const payload = await request.clone().arrayBuffer();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const actual = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, payload))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const expected = signature.replace("sha256=", "");
  if (actual.length !== expected.length) return false;
  return actual.split("").every((character, index) => character.charCodeAt(0) === expected.charCodeAt(index));
}

async function serveFile(request: Request, env: Env, path: string) {
  if (!safePath(path)) return new Response("Not found", { status: 404 });
  const object = await env.VAULT.get(`vault/${path}`, { onlyIf: request.headers.get("if-none-match") ? { etagDoesNotMatch: request.headers.get("if-none-match")! } : undefined });
  if (!object) return new Response("Not found", { status: 404 });
  if (!object.body) return new Response(null, { status: 304, headers: { etag: object.httpEtag } });
  const headers = new Headers({ etag: object.httpEtag, "cache-control": `public, max-age=${CACHE_SECONDS}` });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/vault" && request.method === "GET") {
      const manifest = await readManifest(env);
      return manifest ? json(manifest) : json({ message: "まだ同期されていません。" }, { status: 503 });
    }
    if (url.pathname.startsWith("/api/file/") && request.method === "GET") return serveFile(request, env, decodeURIComponent(url.pathname.slice(10)));
    if (url.pathname === "/api/webhook/github" && request.method === "POST") {
      if (!await validSignature(request, env.GITHUB_WEBHOOK_SECRET)) return json({ message: "署名が正しくありません。" }, { status: 401 });
      if (request.headers.get("x-github-event") !== "push") return json({ accepted: true });
      ctx.waitUntil(syncVault(env));
      return json({ accepted: true }, { status: 202 });
    }
    if (url.pathname === "/api/admin/sync" && request.method === "POST") {
      if (request.headers.get("authorization") !== `Bearer ${env.SYNC_TOKEN}`) return json({ message: "認証が必要です。" }, { status: 401 });
      try { return json(await syncVault(env)); } catch (error) { return json({ message: error instanceof Error ? error.message : "同期に失敗しました。" }, { status: 502 }); }
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
