const listEl = document.getElementById("note-list");
const searchEl = document.getElementById("search");
const titleEl = document.getElementById("note-title");
const metaEl = document.getElementById("note-meta");
const contentEl = document.getElementById("note-content");

const state = {
  notes: [],
  filtered: [],
  active: null,
  noteMap: new Map(),
  assetMap: new Map(),
};

function getRepoInfo() {
  const host = window.location.hostname;
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const isGitHubPages = host.endsWith(".github.io");
  const owner = isGitHubPages ? host.replace(/\.github\.io$/, "") : null;
  const repo = pathParts[0] || null;
  return { owner, repo };
}

function titleFromFilename(filename) {
  return filename
    .replace(/\.md$/i, "")
    .replace(/^[.\-_]+/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function pathToSlug(path) {
  return path
    .replace(/^notes\//, "")
    .replace(/\.md$/i, "")
    .replace(/^\./, "")
    .replace(/^[.\-_]+/, "")
    .replace(/[\/]+/g, "-")
    .replace(/[-_]+/g, "-")
    .toLowerCase();
}

function stripNotesPrefix(path) {
  return path.replace(/^notes\//, "");
}

function normalizeNoteRelativePath(path) {
  return path.replace(/^\.\/?/, "").replace(/^notes\//, "");
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[\u3000\s]+/g, "-")
    .replace(/[^\w\-ぁ-んァ-ヶ一-龠]+/g, "")
    .replace(/\-+/g, "-");
}

function titleFromPath(relativePath) {
  const filename = relativePath.split("/").pop();
  return titleFromFilename(filename);
}

function normalizeWikiTarget(target, currentPath) {
  const trimmed = target.trim();
  const currentDir = currentPath.includes("/") ? currentPath.split("/").slice(0, -1).join("/") : "";
  const withMd = trimmed.toLowerCase().endsWith(".md") ? trimmed : `${trimmed}.md`;
  const relativeCandidate = currentDir && !trimmed.includes("/") && !trimmed.startsWith(".") ? `${currentDir}/${withMd}` : withMd;
  const strippedCandidate = withMd.replace(/^\.\//, "");
  const candidates = [trimmed, withMd, relativeCandidate, strippedCandidate];
  return [...new Set(candidates)];
}

function resolveNoteCandidate(target, currentPath) {
  const currentRelativePath = normalizeNoteRelativePath(currentPath);
  const candidates = normalizeWikiTarget(target, currentRelativePath);
  for (const candidate of candidates) {
    const relative = candidate.replace(/^notes\//, "");
    const slug = pathToSlug(candidate.startsWith("notes/") ? candidate : `notes/${relative}`);
    const bySlug = state.noteMap.get(slug);
    if (bySlug) return bySlug;

    const stem = relative.replace(/\.md$/i, "").replace(/^[.\-_]+/, "");
    for (const note of state.notes) {
      const noteStem = stripNotesPrefix(note.path).replace(/\.md$/i, "");
      if (noteStem === stem || note.title.toLowerCase() === stem.toLowerCase()) {
        return note;
      }
    }
  }
  return null;
}

function resolveAssetPath(target, currentPath) {
  const currentRelativePath = normalizeNoteRelativePath(currentPath);
  const currentDir = currentRelativePath.includes("/") ? currentRelativePath.split("/").slice(0, -1).join("/") : "";
  const cleanTarget = target.replace(/^\.\//, "");
  const candidates = [];

  if (currentDir && !cleanTarget.includes("/")) {
    candidates.push(`notes/${currentDir}/${cleanTarget}`);
  }
  candidates.push(`notes/${cleanTarget}`);
  candidates.push(cleanTarget.startsWith("notes/") ? cleanTarget : `notes/${cleanTarget}`);

  const normalized = [...new Set(candidates.map((candidate) => candidate.replace(/\/+/g, "/")))];
  for (const candidate of normalized) {
    if (state.assetMap.has(candidate)) return candidate;
  }
  return null;
}

function extractFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { body: markdown, meta: {} };
  const meta = {};
  for (const line of match[1].split("\n")) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (pair) meta[pair[1].toLowerCase()] = pair[2].replace(/^["']|["']$/g, "");
  }
  return { body: markdown.slice(match[0].length), meta };
}

function stripFrontmatter(markdown) {
  return markdown.replace(/^---[\s\S]*?---\n?/, "");
}

function extractHeadingSection(markdown, headingText) {
  const body = stripFrontmatter(markdown);
  const targetSlug = slugify(headingText);
  const lines = body.split("\n");
  let startIndex = -1;
  let startLevel = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (match && slugify(match[2]) === targetSlug) {
      startIndex = i;
      startLevel = match[1].length;
      break;
    }
  }

  if (startIndex === -1) return null;

  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const match = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (match && match[1].length <= startLevel) {
      endIndex = i;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join("\n");
}

function addHeadingAnchors(container) {
  container.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((heading) => {
    if (!heading.id) {
      heading.id = slugify(heading.textContent || "");
    }
  });
}

async function renderMarkdown(markdown, currentNote, stack = []) {
  const { body } = extractFrontmatter(markdown);
  const replaced = await replaceCustomSyntax(body, currentNote, stack);
  const html = marked.parse(replaced);
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<article>${html}</article>`, "text/html");
  addHeadingAnchors(doc.body);
  return doc.body.innerHTML;
}

async function replaceCustomSyntax(markdown, currentNote, stack) {
  const tokens = [];
  const pattern = /(!?)\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
  let output = markdown;

  for (const match of markdown.matchAll(pattern)) {
    const [fullMatch, bang, target, heading, label] = match;
    const token = `@@OBSIDIAN_${tokens.length}@@`;
    tokens.push({ token, bang, target: target.trim(), heading: heading?.trim() || "", label: label?.trim() || "" });
    output = output.replace(fullMatch, token);
  }

  for (const item of tokens) {
    const replacement = await renderToken(item, currentNote, stack);
    output = output.replace(item.token, replacement);
  }

  return output;
}

async function renderToken(token, currentNote, stack) {
  const isEmbed = token.bang === "!";
  const targetNote = resolveNoteCandidate(token.target, currentNote.path);
  const targetAsset = resolveAssetPath(token.target, currentNote.path);
  const displayLabel = token.label || token.target;

  if (!isEmbed) {
    if (token.heading) {
      const targetSlug = slugify(token.target);
      const headingSlug = slugify(token.heading);
      const note = targetNote;
      if (note) {
        const href = `?note=${encodeURIComponent(note.slug)}#${headingSlug}`;
        const text = displayLabel || note.title;
        return `[${text}](${href})`;
      }
    }

    if (targetAsset) {
      const href = `./${targetAsset}`;
      if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(targetAsset)) {
        return `![${displayLabel}](${href})`;
      }
      return `[${displayLabel}](${href})`;
    }

    if (targetNote) {
      const href = `?note=${encodeURIComponent(targetNote.slug)}${token.heading ? `#${slugify(token.heading)}` : ""}`;
      return `[${displayLabel || targetNote.title}](${href})`;
    }

    return displayLabel;
  }

  if (targetAsset) {
    if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(targetAsset)) {
      return `<figure class="embed embed-image"><img src="./${targetAsset}" alt="${displayLabel || titleFromPath(targetAsset)}" /></figure>`;
    }
    return `<a class="embed embed-attachment" href="./${targetAsset}">${displayLabel || titleFromPath(targetAsset)}</a>`;
  }

  if (!targetNote) {
    return `<div class="embed embed-missing">見つかりません: ${displayLabel || token.target}</div>`;
  }

  if (stack.includes(targetNote.path)) {
    return `<div class="embed embed-recursive">循環参照のため省略: ${targetNote.title}</div>`;
  }

  const response = await fetch(targetNote.path);
  if (!response.ok) {
    return `<div class="embed embed-missing">読み込めません: ${targetNote.title}</div>`;
  }
  const raw = await response.text();
  const sectionMarkdown = token.heading ? extractHeadingSection(raw, token.heading) : raw;
  if (!sectionMarkdown) {
    return `<div class="embed embed-missing">見出しが見つかりません: ${displayLabel || token.heading}</div>`;
  }
  const html = await renderMarkdown(sectionMarkdown, targetNote, [...stack, currentNote.path, targetNote.path]);
  const headingLabel = token.heading ? `${targetNote.title} / ${token.heading}` : targetNote.title;
  return `<details class="embed embed-note" open><summary>${headingLabel}</summary>${html}</details>`;
}

async function loadNote(note) {
  const response = await fetch(note.path);
  if (!response.ok) {
    throw new Error(`ノートを読み込めませんでした: ${note.path}`);
  }
  const raw = await response.text();
  const html = await renderMarkdown(raw, note, [note.path]);
  contentEl.innerHTML = html;
  addHeadingAnchors(contentEl);
  titleEl.textContent = note.title;
  metaEl.textContent = note.description ?? "";
  state.active = note.slug;
  document.querySelectorAll(".note-list button").forEach((button) => {
    button.classList.toggle("active", button.dataset.slug === note.slug);
  });
  const url = new URL(window.location.href);
  url.searchParams.set("note", note.slug);
  history.replaceState({}, "", url);
}

async function loadNotes() {
  const { owner, repo } = getRepoInfo();
  if (!owner || !repo) {
    throw new Error("GitHub Pages のリポジトリ名を特定できませんでした");
  }

  const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });
  if (!repoResponse.ok) {
    throw new Error("リポジトリ情報を取得できませんでした");
  }

  const repoData = await repoResponse.json();
  const branch = repoData.default_branch || "main";
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const response = await fetch(apiUrl, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });
  if (!response.ok) {
    throw new Error("ノート一覧を取得できませんでした");
  }

  const data = await response.json();
  const files = (data.tree || []).filter(
    (entry) => entry.type === "blob" && entry.path.startsWith("notes/") && entry.path.toLowerCase().endsWith(".md"),
  );

  const notes = files
    .filter((file) => !file.path.replace(/^notes\//, "").split("/").some((part) => part.startsWith(".")))
    .map((file) => {
      const relativePath = file.path.replace(/^notes\//, "");
      const filename = relativePath.split("/").pop();
      const slug = pathToSlug(file.path);
      const title = titleFromFilename(filename);
      return {
        slug,
        title,
        relativePath,
        path: `./${file.path}`,
        description: "",
        tags: [],
        excerpt: `ファイル: ${filename}`,
      };
    });

  const assets = (data.tree || []).filter((entry) => {
    return (
      entry.type === "blob" &&
      entry.path.startsWith("notes/") &&
      !entry.path.toLowerCase().endsWith(".md") &&
      !entry.path.replace(/^notes\//, "").split("/").some((part) => part.startsWith("."))
    );
  });

  state.noteMap = new Map(notes.map((note) => [note.slug, note]));
  state.assetMap = new Map(assets.map((asset) => [asset.path, asset]));
  return notes;
}

function renderList(notes) {
  listEl.innerHTML = "";
  notes.forEach((note) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.slug = note.slug;
    button.innerHTML = `
      <span class="title">${note.title}</span>
      <span class="excerpt">${note.excerpt}</span>
    `;
    button.addEventListener("click", () => loadNote(note));
    li.appendChild(button);
    listEl.appendChild(li);
  });
}

function applyFilter(query) {
  const text = query.trim().toLowerCase();
  state.filtered = state.notes.filter((note) => {
    return (
      note.title.toLowerCase().includes(text) ||
      note.description.toLowerCase().includes(text) ||
      note.tags.join(" ").toLowerCase().includes(text)
    );
  });
  renderList(state.filtered);
  const selected = state.filtered.find((note) => note.slug === state.active) ?? state.filtered[0];
  if (selected) {
    loadNote(selected);
  } else {
    titleEl.textContent = "該当するノートがありません";
    metaEl.textContent = "検索条件を変えてください。";
    contentEl.innerHTML = "<p>公開対象のノートが見つかりませんでした。</p>";
  }
}

async function init() {
  state.notes = await loadNotes();
  state.filtered = state.notes;
  renderList(state.notes);

  const params = new URL(window.location.href).searchParams;
  const slug = params.get("note");
  const initial = state.notes.find((note) => note.slug === slug) ?? state.notes[0];
  if (initial) {
    await loadNote(initial);
  }

  searchEl.addEventListener("input", (event) => applyFilter(event.target.value));
}

init().catch((error) => {
  titleEl.textContent = "読み込みに失敗しました";
  metaEl.textContent = "ファイル構成を確認してください。";
  contentEl.innerHTML = `<pre>${error.message}</pre>`;
});
