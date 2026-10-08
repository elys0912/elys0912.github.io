import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { loadPostDirectory, parseFrontmatter } from "./markdown-posts.ts";

describe("parseFrontmatter", () => {
  test("引用符付きの文字列、true / false、素の文字列を読み、本文を分ける", () => {
    const parsed = parseFrontmatter(
      [
        "---",
        'title: "引用符 \\"付き\\" # コメントではない"',
        "summary: 'シングル''引用符'",
        "publishedAt: 2026-10-10T09:00:00+09:00 # 行末のコメント",
        "draft: true",
        "marp: false",
        "theme: default",
        "---",
        "# 本文",
      ].join("\n"),
    );
    assert.deepEqual(parsed?.data, {
      title: '引用符 "付き" # コメントではない',
      summary: "シングル'引用符",
      publishedAt: "2026-10-10T09:00:00+09:00",
      draft: true,
      marp: false,
      theme: "default",
    });
    assert.equal(parsed?.body, "# 本文");
  });

  test("BOM と CRLF を取り除く", () => {
    const parsed = parseFrontmatter("﻿---\r\ntitle: タイトル\r\n---\r\n本文\r\n");
    assert.deepEqual(parsed?.data, { title: "タイトル" });
    assert.equal(parsed?.body, "本文\n");
  });

  test("値が空のキー、ブロック、インデントした行は読まない", () => {
    const parsed = parseFrontmatter(["---", "title:", "summary: |", "  複数行", "style: >", "---", ""].join("\n"));
    assert.deepEqual(parsed?.data, {});
  });

  test("先頭が --- でない、閉じの --- が無ければ undefined", () => {
    assert.equal(parseFrontmatter("# 本文だけ"), undefined);
    assert.equal(parseFrontmatter("\n---\ntitle: a\n---\n"), undefined);
    assert.equal(parseFrontmatter("---\ntitle: a\n"), undefined);
  });
});

describe("loadPostDirectory", () => {
  let dir: string;

  before(() => {
    dir = mkdtempSync(path.join(tmpdir(), "markdown-posts-"));
    const write = (file: string, lines: string[]) => writeFileSync(path.join(dir, file), lines.join("\n"));
    write("draft-post.md", [
      "---",
      "title: 下書きの記事",
      "summary: 概要",
      "publishedAt: 2999-01-01T09:00:00+09:00",
      "draft: true",
      "---",
      "# 本文",
    ]);
    write("slides.md", [
      "---",
      "title: スライド",
      "summary: 概要",
      "publishedAt: 2026-10-01T00:00:00Z",
      "marp: true",
      "theme: default",
      "---",
      "# 1 枚目",
    ]);
    write("published.md", [
      "---",
      "title: 公開済み",
      'summary: "概要"',
      "publishedAt: 2026-09-28T00:00:00+09:00",
      "---",
      "# 概要",
    ]);
    write("no-title.md", ["---", "summary: 概要", "publishedAt: 2026-10-01T00:00:00Z", "---", "本文"]);
    write("bad-date.md", ["---", "title: t", "summary: s", "publishedAt: 2026-10-01", "---", "本文"]);
    write(".hidden.md", ["---", "title: 隠し", "---", "本文"]);
    write("readme.txt", ["メモ"]);
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  test("ファイル名順に読み、下書きと未来の日時も含める。publishedAt は UTC にそろえる", () => {
    const posts = loadPostDirectory(dir, () => {});
    assert.deepEqual(
      posts.map((post) => post.slug),
      ["draft-post", "published", "slides"],
    );
    assert.deepEqual(posts[0], {
      slug: "draft-post",
      title: "下書きの記事",
      summary: "概要",
      bodyMarkdown: "# 本文",
      publishedAt: "2999-01-01T00:00:00.000Z",
      updatedAt: "2999-01-01T00:00:00.000Z",
      draft: true,
    });
    assert.equal(posts[1].draft, undefined);
    assert.equal(posts[1].publishedAt, "2026-09-27T15:00:00.000Z");
  });

  test("Marp の記事は title などを除いた frontmatter を本文の先頭に残す", () => {
    const slides = loadPostDirectory(dir, () => {}).find((post) => post.slug === "slides");
    assert.equal(slides?.bodyMarkdown, "---\nmarp: true\ntheme: default\n---\n# 1 枚目");
  });

  test("必須キーが無い、publishedAt が読めないファイルは理由を警告してスキップする", () => {
    const warnings: string[] = [];
    loadPostDirectory(dir, (message) => warnings.push(message));
    const dirName = path.basename(dir);
    assert.equal(warnings.length, 3);
    assert.ok(warnings[0].includes(`${dirName}/bad-date.md をスキップしました: publishedAt`), warnings[0]);
    assert.ok(warnings[1].includes(`${dirName}/no-title.md をスキップしました: title がありません`), warnings[1]);
    assert.ok(warnings[2].includes(`${dirName}/readme.txt を読みません`), warnings[2]);
  });

  test("ディレクトリが無ければ空の配列", () => {
    assert.deepEqual(loadPostDirectory(path.join(dir, "missing"), () => {}), []);
  });
});
