import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderMarkdown } from "./markdown.ts";
import { isMarpMarkdown, renderMarp } from "./marp.ts";

// 共有部品の import の検査（scripts/shared-with-blog.test.mjs）が CSS の `@import` の文を指定子として拾うので、分けて書く
const AT_IMPORT = "@imp" + "ort";

const deck = ["---", "marp: true", "theme: default", "---", "", "# 1 枚目", "", "---", "", "## 2 枚目"].join(
  "\n",
);

describe("isMarpMarkdown", () => {
  test("先頭の frontmatter に marp: true があれば Marp", () => {
    assert.equal(isMarpMarkdown(deck), true);
    assert.equal(isMarpMarkdown("---\r\nmarp: true\r\n---\r\n# CRLF"), true);
  });

  test("frontmatter が無い、または marp: true が無ければ Marp ではない", () => {
    assert.equal(isMarpMarkdown("# 普通の記事\n\nmarp: true と書いてある"), false);
    assert.equal(isMarpMarkdown("---\ntheme: default\n---\n# 本文"), false);
    assert.equal(isMarpMarkdown("---\nmarp: false\n---\n# 本文"), false);
  });

  test("コードブロックの中や、先頭以外の frontmatter には反応しない", () => {
    assert.equal(isMarpMarkdown("# 見出し\n\n```yaml\n---\nmarp: true\n---\n```\n"), false);
    assert.equal(isMarpMarkdown("\n---\nmarp: true\n---\n# 先頭に空行"), false);
  });
});

describe("renderMarp", () => {
  test("スライドごとの section と、div.marpit にスコープした CSS を返す", () => {
    const { html, css } = renderMarp(deck);
    assert.match(html, /^<div class="marpit">/);
    assert.equal((html.match(/<section/g) ?? []).length, 2);
    assert.match(html, /<h1>1 枚目<\/h1>/);
    assert.match(html, /<h2>2 枚目<\/h2>/);
    assert.ok(css.length > 0);
    assert.match(css, /div\.marpit/);
    assert.doesNotMatch(css, /<\/?script/i);
  });

  test("helper script を埋め込まない", () => {
    const { html } = renderMarp(deck);
    assert.doesNotMatch(html, /<script/i);
  });

  test("スライドの中の生の HTML は文字としてエスケープする", () => {
    const { html } = renderMarp(
      ["---", "marp: true", "---", "# 見出し <b>x</b>", "", '<img src="x" onerror="alert(1)">', "", "<script>alert(1)</script>"].join(
        "\n",
      ),
    );
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /<img/i);
    assert.doesNotMatch(html, /<b>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  test("見出しとスライドに id を付けない", () => {
    const { html } = renderMarp(deck);
    assert.doesNotMatch(html, /\sid=/);
  });

  test("絵文字は外部の画像に変換しない", () => {
    const { html } = renderMarp("---\nmarp: true\n---\n# :smile: 😄");
    assert.doesNotMatch(html, /<img/i);
    assert.doesNotMatch(html, /twemoji/i);
    assert.match(html, /😄 😄/);
  });

  test("gaia テーマの外部のフォントの `@import` を出力に含めない（テーマの CSS は残る）", () => {
    const { css } = renderMarp("---\nmarp: true\ntheme: gaia\n---\n# 1 枚目");
    assert.doesNotMatch(css, /@import/i);
    assert.doesNotMatch(css, /fonts\.bunny\.net/);
    assert.match(css, /^@charset "UTF-8";div\.marpit/);
    assert.match(css, /Lato/);
  });

  test("スライドに書いた `@import` も除く（引用符の中の ; で文を切らない）", () => {
    const { css } = renderMarp(
      [
        "---",
        "marp: true",
        "style: |",
        '  @import url("https://example.invalid/a;b.css") screen;',
        "  section { color: rgb(1, 2, 3); }",
        "---",
        "<style>",
        `${AT_IMPORT} 'https://example.invalid/c.css';`,
        "</style>",
        "",
        "# 1 枚目",
      ].join("\n"),
    );
    assert.doesNotMatch(css, /@import|example\.invalid/i);
    assert.match(css, /^div\.marpit/);
    assert.match(css, /color:\s*(?:rgb\(1,\s*2,\s*3\)|#010203)/);
  });

  test("普通の Markdown の表示は変わらない（frontmatter が無ければ renderMarkdown のまま）", () => {
    const markdown = "# 見出し\n\n本文";
    assert.equal(isMarpMarkdown(markdown), false);
    assert.equal(renderMarkdown(markdown), "<h2>見出し</h2>\n<p>本文</p>");
  });
});
