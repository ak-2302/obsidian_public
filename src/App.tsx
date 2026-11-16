import { useEffect, useMemo, useState } from "react";
import { renderMarkdown, titleFor } from "./markdown";
import type { VaultFile, VaultManifest } from "./types";

function noteFiles(files: VaultFile[]) { return files.filter((file) => file.path.toLowerCase().endsWith(".md")); }
function formatDate(value: string) { return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

export function App() {
  const [manifest, setManifest] = useState<VaultManifest | null>(null);
  const [activePath, setActivePath] = useState("");
  const [source, setSource] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/vault").then(async (response) => {
      if (!response.ok) throw new Error((await response.json() as { message?: string }).message || "ノートを取得できませんでした。");
      return response.json() as Promise<VaultManifest>;
    }).then((data) => {
      setManifest(data);
      const hashPath = decodeURIComponent(location.hash.replace(/^#\//, "").split("#")[0]);
      setActivePath(noteFiles(data.files).some((file) => file.path === hashPath) ? hashPath : noteFiles(data.files)[0]?.path ?? "");
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "読み込みに失敗しました。"));
  }, []);

  useEffect(() => {
    if (!manifest) return;
    const updateFromHash = () => {
      const path = decodeURIComponent(location.hash.replace(/^#\//, "").split("#")[0]);
      if (noteFiles(manifest.files).some((file) => file.path === path)) setActivePath(path);
    };
    addEventListener("hashchange", updateFromHash);
    return () => removeEventListener("hashchange", updateFromHash);
  }, [manifest]);

  useEffect(() => {
    if (!activePath) return;
    location.hash = `/${activePath.split("/").map(encodeURIComponent).join("/")}`;
    fetch(`/api/file/${activePath.split("/").map(encodeURIComponent).join("/")}`).then((response) => {
      if (!response.ok) throw new Error("本文を取得できませんでした。");
      return response.text();
    }).then(setSource).catch((caught) => setError(caught instanceof Error ? caught.message : "本文を取得できませんでした。"));
  }, [activePath]);

  const notes = useMemo(() => noteFiles(manifest?.files ?? []).filter((file) => file.path.toLowerCase().includes(query.toLowerCase())), [manifest, query]);
  const bodySource = useMemo(() => source.replace(/^#\s+.+\n+/, ""), [source]);
  const headings = useMemo(() => [...bodySource.matchAll(/^(#{1,3})\s+(.+)$/gm)].map((match) => ({ level: match[1].length, text: match[2] })), [bodySource]);
  const title = activePath ? titleFor(activePath) : "ノートがありません";

  if (error) return <main className="status_page"><h1>読み込みできません</h1><p>{error}</p><p>GitHub Webhookを設定するか、管理同期APIを一度実行してください。</p></main>;
  if (!manifest) return <main className="status_page" aria-busy="true"><h1>Vaultを読み込んでいます</h1></main>;

  return <div className="app_shell">
    <header className="top_bar"><a className="vault_name" href="/">個人の知識庫</a><span>最新コミット: <code>{manifest.commitSha.slice(0, 7)}</code></span><span>同期: {formatDate(manifest.syncedAt)}</span></header>
    <aside className="file_sidebar"><label htmlFor="search">ノートを検索</label><input id="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="タイトルまたはパス" />
      <nav aria-label="ノート一覧"><ul>{notes.map((file) => <li key={file.path}><button className={file.path === activePath ? "active" : ""} onClick={() => setActivePath(file.path)}><span>{titleFor(file.path)}</span><small>{file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "ルート"}</small></button></li>)}</ul></nav>
    </aside>
    <main className="reader"><header><p className="breadcrumb">{activePath}</p><h1>{title}</h1></header><article dangerouslySetInnerHTML={{ __html: renderMarkdown(bodySource, activePath, manifest.files) }} /></main>
    <aside className="outline"><h2>アウトライン</h2><nav aria-label="見出し一覧">{headings.length ? headings.map((heading, index) => <button key={`${heading.text}-${index}`} className={`heading_level_${heading.level}`} onClick={() => document.querySelectorAll("article h1, article h2, article h3")[index]?.scrollIntoView({ behavior: "smooth", block: "start" })}>{heading.text}</button>) : <p>見出しはありません</p>}</nav></aside>
  </div>;
}
