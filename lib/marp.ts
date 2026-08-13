// Marp のスライド記事（frontmatter に marp: true がある本文）を HTML と CSS に変換する。
// ビルド時に Server Component からだけ呼ぶ（marp-core をクライアントのバンドルに入れない）。
//
// marp-core の出力は rehype-sanitize を通さない。信頼の根拠は「PR を通したリポジトリの content/ の内容」。
// その代わり、生の HTML は html: false で全部エスケープし、helper script の埋め込みも止める。
// 出力の CSS からは `@import` を除き、外部のファイルを読み込ませない（stripLeadingImports）。

import { Marp } from "@marp-team/marp-core";

// 本文の先頭にある frontmatter だけを見る（コードブロックの中の marp: true には反応しない）
const leadingFrontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export interface MarpDeck {
  /** `<div class="marpit">` から始まるスライドの HTML */
  html: string;
  /** `div.marpit` の下にスコープされたテーマの CSS */
  css: string;
}

/** 本文の先頭の frontmatter に `marp: true` があるかどうか */
export function isMarpMarkdown(markdown: string): boolean {
  const match = leadingFrontmatter.exec(markdown);
  return match !== null && /^marp:\s*true\s*$/m.test(match[1]);
}

const marp = new Marp({
  // Markdown 中の生の HTML は許可せず、文字としてエスケープする
  html: false,
  // ブラウザ用の helper script を HTML に埋め込まない（MarpDeck が browser() を呼ぶ）
  script: false,
  // 数式は使うまで無効（MathJax / KaTeX の CSS と依存を出力に入れない）
  math: false,
  // 絵文字は Twemoji（外部 CDN の画像）に変換せず、Unicode のまま出す
  emoji: { shortcode: true, unicode: false },
  // 見出しとスライドに id を付けない（ページ内の要素を上書きされないように。lib/markdown.ts と同じ方針）
  slug: false,
  anchor: false,
  minifyCSS: true,
});

export function renderMarp(markdown: string): MarpDeck {
  const { html, css } = marp.render(markdown);
  return { html, css: stripLeadingImports(css) };
}

// CSS の `@import` は出力から除く。gaia テーマは先頭で外部のフォント（fonts.bunny.net）を `@import` するが、
// 外部への通信になり、CSP（style-src と font-src が 'self'）でも止まる。除くとテーマはシステムのフォントで出る。
// Marpit は @charset と `@import` を CSS の先頭へ寄せて出す（テーマ、<style>、style ディレクティブのどれに書いたものも）。
// そのため、先頭に並んだ `@import` の文だけを取り除けば足りる。
const leadingCharset = /^@charset\s*"[^"]*";/;
const importAtRule = /^@import(?![\w-])/i;

function stripLeadingImports(css: string): string {
  const charset = leadingCharset.exec(css)?.[0] ?? "";
  let rest = css.slice(charset.length);
  for (;;) {
    const statement = rest.trimStart();
    if (!importAtRule.test(statement)) break;
    rest = statement.slice(endOfStatement(statement) + 1);
  }
  return charset + rest;
}

/** 文の終わりの `;` の位置。引用符と括弧の中の `;` は数えない。無ければ末尾（CSS では文の終わりになる） */
function endOfStatement(css: string): number {
  let quote: string | undefined;
  let depth = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote !== undefined) {
      if (c === "\\") i++;
      else if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) return i;
  }
  return css.length;
}
