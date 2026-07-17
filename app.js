const listEl = document.getElementById("note-list");
const searchEl = document.getElementById("search");
const titleEl = document.getElementById("note-title");
const metaEl = document.getElementById("note-meta");
const contentEl = document.getElementById("note-content");

const state = {
  notes: [],
  filtered: [],
  active: null,
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
    .replace(/[-_]+/g, "-")
    .toLowerCase();
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[\u3000\s]+/g, "-")
    .replace(/[^\w\-ぁ-んァ-ヶ一-龠]+/g, "")
    .replace(/\-+/g, "-");
}

function transformWikilinks(markdown, titles) {
  return markdown.replace(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
    const slug = slugify(target);
    const known = titles[slug] ?? target;
    const text = label ?? known;
    return `[${text}](?note=${encodeURIComponent(slug)})`;
  });
}

function stripFrontmatter(markdown) {
  return markdown.replace(/^---[\s\S]*?---\n?/, "");
}

async function loadNote(note) {
  const response = await fetch(note.path);
  if (!response.ok) {
    throw new Error(`ノートを読み込めませんでした: ${note.path}`);
  }
  const raw = await response.text();
  const titles = Object.fromEntries(state.notes.map((entry) => [entry.slug, entry.title]));
  const html = marked.parse(transformWikilinks(stripFrontmatter(raw), titles));
  contentEl.innerHTML = html;
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

  return files
    .filter((file) => !file.path.split("/").pop().startsWith("."))
    .map((file) => {
      const filename = file.path.split("/").pop();
      const slug = pathToSlug(file.path);
      const title = titleFromFilename(filename);
      return {
        slug,
        title,
        path: `./${file.path}`,
        description: "",
        tags: [],
        excerpt: `ファイル: ${filename}`,
      };
    });
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
