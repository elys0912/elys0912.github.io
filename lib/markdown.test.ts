import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Root } from "hast";
import { renderMarkdown, renderMarkdownWithHeadings, sanitizeTree } from "./markdown.ts";

describe("renderMarkdown", () => {
  test("許可したタグは残る", () => {
    const html = renderMarkdown(
      [
        "## 見出し",
        "",
        "**太字** と *斜体* と ~~取り消し~~",
        "",
        "- 項目1",
        "- 項目2",
        "",
        "3. 三番目から",
        "",
        "> 引用",
        "",
        "| 左 | 中央 |",
        "| :-- | :-: |",
        "| a | b |",
        "",
        "```ts",
        "const a = 1;",
        "```",
        "",
        "[リンク](/blog/) ![画像](/image.png)",
      ].join("\n"),
    );
    assert.match(html, /<h3>見出し<\/h3>/);
    assert.match(html, /<strong>太字<\/strong>/);
    assert.match(html, /<em>斜体<\/em>/);
    assert.match(html, /<del>取り消し<\/del>/);
    assert.match(html, /<ul>\s*<li>項目1<\/li>/);
    assert.match(html, /<ol start="3">/);
    assert.match(html, /<blockquote>\s*<p>引用<\/p>\s*<\/blockquote>/);
    assert.match(html, /<th align="left">左<\/th>/);
    assert.match(html, /<td align="center">b<\/td>/);
    assert.match(html, /<pre><code class="language-ts">const a = 1;\n<\/code><\/pre>/);
    assert.match(html, /<a href="\/blog\/">リンク<\/a>/);
    assert.match(html, /<img src="\/image.png" alt="画像" loading="lazy" decoding="async">/);
  });

  test("見出しを1段下げる（h1 はページのタイトル専用）", () => {
    const html = renderMarkdown(
      ["# 一", "## 二", "### 三", "#### 四", "##### 五", "###### 六"].join("\n\n"),
    );
    assert.doesNotMatch(html, /<h1/);
    assert.match(html, /<h2>一<\/h2>/);
    assert.match(html, /<h3>二<\/h3>/);
    assert.match(html, /<h4>三<\/h4>/);
    assert.match(html, /<h5>四<\/h5>/);
    assert.match(html, /<h6>五<\/h6>/);
    assert.match(html, /<h6>六<\/h6>/);
  });

  test("画像に loading と decoding を付ける（外部の画像にも）", () => {
    const html = renderMarkdown('![外部](https://example.com/a.png "説明")');
    assert.match(
      html,
      /<img src="https:\/\/example.com\/a.png" alt="外部" title="説明" loading="lazy" decoding="async">/,
    );
  });

  test("script は中身ごと除去する", () => {
    const html = renderMarkdown("本文\n\n<script>alert(1)</script>\n\n続き");
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /alert/);
    assert.match(html, /<p>本文<\/p>/);
    assert.match(html, /<p>続き<\/p>/);
  });

  test("文中の script はタグだけ除去し、中身は実行されない文字として残す", () => {
    const html = renderMarkdown("文中に<script>alert(1)</script>がある");
    assert.doesNotMatch(html, /<script/i);
    assert.equal(html, "<p>文中にalert(1)がある</p>");
  });

  test("インラインの生の HTML も除去する", () => {
    const html = renderMarkdown('クリック<span onclick="alert(1)">ここ</span>');
    assert.doesNotMatch(html, /<span/);
    assert.doesNotMatch(html, /onclick/i);
  });

  test("onerror 属性を持つ img を除去する", () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');
    assert.doesNotMatch(html, /onerror/i);
    assert.doesNotMatch(html, /alert/);
  });

  test("javascript: の URL を除去する", () => {
    const html = renderMarkdown("[押して](javascript:alert(1)) [大文字](JavaScript:alert(1))");
    assert.doesNotMatch(html, /javascript:/i);
    assert.match(html, /<a>押して<\/a>/);
  });

  test("data: の画像 URL を除去する", () => {
    const html = renderMarkdown("![画像](data:image/svg+xml;base64,PHN2Zz4=)");
    assert.doesNotMatch(html, /data:/);
  });

  test("外部リンクにだけ rel を付ける", () => {
    const html = renderMarkdown(
      "[外部](https://example.com/) [省略形](//example.com/) [内部](/works/) [メール](mailto:a@example.com)",
    );
    assert.match(html, /<a href="https:\/\/example.com\/" rel="noopener noreferrer">外部<\/a>/);
    assert.match(html, /<a href="\/\/example.com\/" rel="noopener noreferrer">省略形<\/a>/);
    assert.match(html, /<a href="\/works\/">内部<\/a>/);
    assert.match(html, /<a href="mailto:a@example.com">メール<\/a>/);
  });

  test("許可していない class は除去する", () => {
    const html = renderMarkdown("```js onload=x\nx\n```");
    assert.match(html, /<code class="language-js">/);
    assert.doesNotMatch(html, /onload/);
  });
});

// 生の HTML は変換の段階で捨てられるので、サニタイズ単体でも防げることを hast の木で確かめる
describe("sanitizeTree", () => {
  test("script、on* 属性、javascript: の URL、許可していないタグと属性を除去する", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "script",
          properties: {},
          children: [{ type: "text", value: "alert(1)" }],
        },
        {
          type: "element",
          tagName: "div",
          properties: { id: "main", style: "color: red" },
          children: [
            {
              type: "element",
              tagName: "img",
              properties: { src: "/a.png", alt: "a", onError: "alert(1)" },
              children: [],
            },
            {
              type: "element",
              tagName: "a",
              properties: { href: "javascript:alert(1)", onClick: "alert(1)" },
              children: [{ type: "text", value: "リンク" }],
            },
          ],
        },
      ],
    };

    const sanitized = sanitizeTree(tree);

    assert.deepEqual(sanitized.children, [
      { type: "element", tagName: "img", properties: { src: "/a.png", alt: "a" }, children: [] },
      { type: "element", tagName: "a", properties: {}, children: [{ type: "text", value: "リンク" }] },
    ]);
  });

  test("h1、loading、decoding は許可リストに無いので除去する（後処理でしか付かない）", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "h1",
          properties: {},
          children: [{ type: "text", value: "見出し" }],
        },
        {
          type: "element",
          tagName: "img",
          properties: { src: "/a.png", loading: "eager", decoding: "sync" },
          children: [],
        },
      ],
    };

    assert.deepEqual(sanitizeTree(tree).children, [
      { type: "text", value: "見出し" },
      { type: "element", tagName: "img", properties: { src: "/a.png" }, children: [] },
    ]);
  });
});

describe("renderMarkdownWithHeadings", () => {
  test("本文の h2 に連番の id を付け、目次の項目として返す（h3 以下は入れない）", () => {
    const { html, headings } = renderMarkdownWithHeadings(
      ["# はじめに", "", "本文", "", "## 細目", "", "# **太字**の見出し"].join("\n"),
    );
    assert.match(html, /<h2 id="section-1">はじめに<\/h2>/);
    assert.match(html, /<h3>細目<\/h3>/);
    assert.match(html, /<h2 id="section-2"><strong>太字<\/strong>の見出し<\/h2>/);
    assert.deepEqual(headings, [
      { id: "section-1", text: "はじめに" },
      { id: "section-2", text: "太字の見出し" },
    ]);
  });

  test("記事に書いた id は付けず、サニタイズも renderMarkdown と同じに効く", () => {
    const { html, headings } = renderMarkdownWithHeadings(
      '# 見出し\n\n<h2 id="x">生</h2><script>alert(1)</script>',
    );
    assert.doesNotMatch(html, /id="x"/);
    assert.doesNotMatch(html, /<script/);
    assert.deepEqual(headings, [{ id: "section-1", text: "見出し" }]);
  });
});
