import DOMPurify from "dompurify";
import { marked } from "marked";
import type { VaultFile } from "./types";

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function resolvePath(target: string, currentPath: string, files: VaultFile[]) {
  const [withoutAlias] = target.split("|");
  const reference = withoutAlias.trim();
  const candidates = [reference, reference.endsWith(".md") ? reference : `${reference}.md`];
  const directory = currentPath.includes("/") ? currentPath.slice(0, currentPath.lastIndexOf("/") + 1) : "";
  if (!reference.includes("/")) candidates.push(`${directory}${reference}`, `${directory}${reference}.md`);
  return files.find((file) => candidates.includes(file.path)) ?? files.find((file) => file.path.replace(/\.md$/i, "").endsWith(reference.replace(/\.md$/i, "")));
}

export function renderMarkdown(source: string, currentPath: string, files: VaultFile[]) {
  const expanded = source
    .replace(/!\[\[([^\]]+)\]\]/g, (_match, target: string) => {
      const file = resolvePath(target, currentPath, files);
      if (!file) return `<span class="missing_embed">埋め込み先がありません: ${target}</span>`;
      const url = `/api/file/${encodePath(file.path)}`;
      if (file.contentType.startsWith("image/")) return `![${target}](${url})`;
      if (file.contentType === "application/pdf") return `<iframe class="pdf_embed" src="${url}" title="${target}"></iframe>`;
      if (file.contentType.startsWith("audio/")) return `<audio controls src="${url}"></audio>`;
      if (file.contentType.startsWith("video/")) return `<video controls src="${url}"></video>`;
      return `[${target}](${url})`;
    })
    .replace(/\[\[([^\]]+)\]\]/g, (_match, target: string) => {
      const [reference, alias] = target.split("|");
      const [note, anchor] = reference.split("#");
      const file = resolvePath(note, currentPath, files);
      if (!file) return `<span class="missing_link">${alias || note}</span>`;
      return `<a href="#/${encodePath(file.path)}${anchor ? `#${encodeURIComponent(anchor)}` : ""}">${alias || note}</a>`;
    })
    .replace(/^> \[!([A-Z]+)\][+-]?\s*(.*)\n((?:>.*(?:\n|$))*)/gim, (_match, kind: string, title: string, body: string) => {
      const content = body.replace(/^>\s?/gm, "").trim();
      return `\n\n<aside class="callout callout_${kind.toLowerCase()}"><strong>${title || kind}</strong><p>${content}</p></aside>\n\n`;
    });
  return DOMPurify.sanitize(marked.parse(expanded, { gfm: true, breaks: true }) as string, { ADD_TAGS: ["iframe", "audio", "video"], ADD_ATTR: ["allow", "allowfullscreen", "controls", "src", "title"] });
}

export function titleFor(path: string) {
  return path.split("/").pop()!.replace(/\.md$/i, "").replace(/[-_]/g, " ");
}
