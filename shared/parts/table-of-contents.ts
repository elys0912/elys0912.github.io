// 記事の目次。項目は本文の h2。初期表示では最初の見出しを現在地にする（現在地の追従は、各サイトのブラウザ側のスクリプト）。

import { cls } from "../lib/css.ts";
import { escapeHtml } from "../lib/html.ts";
import type { Heading } from "../lib/markdown.ts";

export function tableOfContents(headings: readonly Heading[]): string {
  const items = headings.map((heading, index) => {
    const current = index === 0 ? ` aria-current="location"` : "";

    return `<li><a href="#${escapeHtml(heading.id)}"${current}>${escapeHtml(heading.text)}</a></li>`;
  });
  const heading = `<p id="toc-heading"${cls("TableOfContents", "heading")}>目次</p>`;

  return `<nav${cls("TableOfContents", "toc")} aria-labelledby="toc-heading">${heading}<ol${cls("TableOfContents", "list")}>${items.join("")}</ol></nav>`;
}
