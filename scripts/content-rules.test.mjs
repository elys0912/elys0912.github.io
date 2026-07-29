import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { malformedDraftLines, PLACEHOLDER_SLUG, SLUG_PATTERN, unexpectedDotfiles } from "./content-rules.mjs";

const withLines = (...lines) => ["---", "title: t", ...lines, "---", "draft:true は本文なので見ない", ""].join("\n");

describe("malformedDraftLines", () => {
  test("記事の読み込みが読む形の draft は問題なし（true / false、大文字の値、行末のコメント）", () => {
    for (const line of ["draft: true", "draft: false", "draft: True", "draft: FALSE", "draft: true # 下書き", "draft:\ttrue  "]) {
      assert.deepEqual(malformedDraftLines(withLines(line)), [], line);
    }
    assert.deepEqual(malformedDraftLines(withLines()), []);
  });

  test("読めない書き方の draft の行を返す", () => {
    for (const line of [
      "draft:true",
      "Draft: true",
      "DRAFT: true",
      "  draft: true",
      "\tdraft: true",
      "draft :true",
      "draft:",
      "draft: yes",
      'draft: "true"',
      "draft: true#コメント",
    ]) {
      assert.deepEqual(malformedDraftLines(withLines(line)), [line], line);
    }
  });

  test("BOM と CRLF をそろえてから見る。frontmatter の外と、frontmatter が無いファイルは見ない", () => {
    assert.deepEqual(malformedDraftLines("﻿---\r\nDraft: true\r\n---\r\n"), ["Draft: true"]);
    assert.deepEqual(malformedDraftLines("# 本文\ndraft:true\n"), []);
    assert.deepEqual(malformedDraftLines("---\ndraft:true\n"), []);
  });
});

describe("unexpectedDotfiles", () => {
  test(". で始まる名前のうち .gitkeep 以外を返す", () => {
    assert.deepEqual(unexpectedDotfiles([".gitkeep", ".hidden.md", "a.md", ".DS_Store"]), [".hidden.md", ".DS_Store"]);
  });
});

describe("SLUG_PATTERN / PLACEHOLDER_SLUG", () => {
  test("英小文字・数字と - だけ。仮の slug は実在の記事の slug になり得ない", () => {
    assert.equal(SLUG_PATTERN.test("first-post-2"), true);
    for (const slug of ["First", "a_b", "-a", "a-", "a--b", ""]) assert.equal(SLUG_PATTERN.test(slug), false, slug);
    assert.equal(SLUG_PATTERN.test(PLACEHOLDER_SLUG), false);
  });
});
