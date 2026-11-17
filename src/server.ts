import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import express from "express";

const exec = promisify(execFile);
const port = Number(process.env.PORT ?? 8787);
const repositoryValue = process.env.VAULT_REPOSITORY_URL;
const branch = process.env.VAULT_BRANCH ?? "main";
const vaultDirectoryValue = process.env.VAULT_DIRECTORY;
const basicAuthUser = process.env.BASIC_AUTH_USER;
const basicAuthPassword = process.env.BASIC_AUTH_PASSWORD;
const publicPrefix = process.env.PUBLIC_PREFIX?.replace(/^\/+|\/+$/g, "") ?? "";
let pulling: Promise<void> | undefined;

if (!repositoryValue || !vaultDirectoryValue || !basicAuthUser || !basicAuthPassword) throw new Error("VAULT_REPOSITORY_URL、VAULT_DIRECTORY、BASIC_AUTH_USER、BASIC_AUTH_PASSWORD を設定してください。");
const repository: string = repositoryValue;
const vaultDirectory: string = vaultDirectoryValue;

function credentialsMatch(value: string) {
  const expected = Buffer.from(`${basicAuthUser}\0${basicAuthPassword}`);
  const actual = Buffer.from(value);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function command(command: string, args: string[]) { await exec(command, args, { maxBuffer: 8 * 1024 * 1024 }); }
async function updateVault() {
  if (pulling) return pulling;
  pulling = (async () => {
    try {
      await fs.access(path.join(vaultDirectory, ".git"));
      await command("git", ["-C", vaultDirectory, "pull", "--ff-only", "origin", branch]);
    } catch {
      await fs.mkdir(path.dirname(vaultDirectory), { recursive: true });
      await command("git", ["clone", "--branch", branch, "--single-branch", repository, vaultDirectory]);
    } finally { pulling = undefined; }
  })();
  return pulling;
}
function safeRelative(value: string) { return value && !value.startsWith("/") && !value.includes("..") && !value.split("/").some((part) => part.startsWith(".")); }
async function listFiles(directory: string, root = directory): Promise<Array<{ path: string; size: number; contentType: string }>> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const output: Array<{ path: string; size: number; contentType: string }> = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await listFiles(absolute, root));
    else {
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const stat = await fs.stat(absolute);
      output.push({ path: relative, size: stat.size, contentType: relative.endsWith(".md") ? "text/markdown; charset=utf-8" : "application/octet-stream" });
    }
  }
  return output;
}
const app = express();
app.use((request, response, next) => {
  const header = request.header("authorization");
  if (!header?.startsWith("Basic ")) {
    response.set("WWW-Authenticate", 'Basic realm="Obsidian Vault", charset="UTF-8"');
    return response.status(401).send("認証が必要です。");
  }
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    if (credentialsMatch(decoded.replace(/:(.*)$/, "\0$1"))) return next();
  } catch { /* invalid authorization is rejected below */ }
  response.set("WWW-Authenticate", 'Basic realm="Obsidian Vault", charset="UTF-8"');
  return response.status(401).send("認証に失敗しました。");
});
app.use(async (_request, _response, next) => { try { await updateVault(); next(); } catch (error) { next(error); } });
app.get("/api/vault", async (_request, response, next) => { try { const root = publicPrefix ? path.join(vaultDirectory, publicPrefix) : vaultDirectory; response.json({ commitSha: (await exec("git", ["-C", vaultDirectory, "rev-parse", "HEAD"])).stdout.trim(), syncedAt: new Date().toISOString(), files: await listFiles(root) }); } catch (error) { next(error); } });
app.get("/api/file/*splat", async (request, response, next) => { try { const relative = Array.isArray(request.params.splat) ? request.params.splat.join("/") : request.params.splat; if (!safeRelative(relative)) return response.sendStatus(404); const root = publicPrefix ? path.join(vaultDirectory, publicPrefix) : vaultDirectory; response.sendFile(path.resolve(root, relative), { root }, (error) => error && next(error)); } catch (error) { next(error); } });
app.use(express.static("dist"));
app.get("*splat", (_request, response) => response.sendFile(path.resolve("dist/index.html")));
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(502).json({ message: error instanceof Error ? `Git同期に失敗しました: ${error.message}` : "Git同期に失敗しました。" }));
app.listen(port, () => console.log(`Vault Viewer: http://localhost:${port}`));
