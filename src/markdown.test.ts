import { describe, expect, it } from "vitest";
import { titleFor } from "./markdown";

describe("titleFor", () => {
  it("Markdown拡張子を除き、Obsidianのファイル名を表示名にする", () => {
    expect(titleFor("projects/Cloudflare_worker-notes.md")).toBe("Cloudflare worker notes");
  });
});
