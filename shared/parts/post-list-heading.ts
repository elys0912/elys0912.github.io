// 一覧ページの見出しと件数、1 行の説明。ブログと共有する。lib/site.ts・lib/paths.ts は読まない。
// カードのリストは parts/post-list.ts（サイトごとに構造が違うので、共有しない）。

import { cls } from "../lib/css.ts";
import { escapeHtml } from "../lib/html.ts";

/** 一覧の見出しと件数。unit は件数の単位 */
export function postListHeading(title: string, count: number, unit = "件"): string {
  return `<div${cls("PostList", "heading")}><h1>${escapeHtml(title)}</h1><p${cls("PostList", "count")}>${count} ${unit}</p></div>`;
}

/** 見出しと一覧のあいだの、1 行の説明 */
export function postListLead(lead: string): string {
  return `<p${cls("PostList", "lead")}>${escapeHtml(lead)}</p>`;
}
