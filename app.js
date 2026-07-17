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

async function loadIndex() {
  const response = await fetch("./notes/index.json");
  if (!response.ok) {
    throw new Error("notes/index.json を読み込めませんでした");
  }
  return response.json();
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

function excerptFromMarkdown(markdown) {
  return markdown
    .replace(/^---[\s\S]*?---\n?/, "")
    .replace(/\n+/g, " ")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .slice(0, 120);
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
  const index = await loadIndex();
  state.notes = index.notes.map((note) => ({
    ...note,
    excerpt: note.excerpt || excerptFromMarkdown(note.description || note.title),
    description: note.description || "",
    tags: note.tags || [],
  }));
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
