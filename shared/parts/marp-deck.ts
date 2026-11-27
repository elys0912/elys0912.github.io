// Marp のスライド。HTML と CSS は lib/marp.ts が html: false（生の HTML はすべてエスケープ）で変換したもの。
// テーマの CSS は div.marpit の下にスコープされている。文字の自動縮小などは、marp-core の browser script が当てる。
// scriptUrl は、その browser script の URL（ビルドが asset として書き出したもの）。

import { cls } from "../lib/css.ts";
import { escapeHtml } from "../lib/html.ts";
import { renderMarp } from "../lib/marp.ts";

export function marpDeck(markdown: string, scriptUrl: string): string {
  const { html, css } = renderMarp(markdown);
  if (/<\/style/i.test(css)) throw new Error("Marp の CSS に </style が含まれています");

  return `<div${cls("MarpDeck", "deck")}><style>${css}</style><div>${html}</div></div><script src="${escapeHtml(scriptUrl)}" defer></script>`;
}
