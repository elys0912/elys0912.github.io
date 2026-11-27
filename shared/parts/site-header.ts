// ヘッダー。文字のロゴやマークは置かず、3 つのアクセント色を背景として左に差し込む（CSS）。
// ナビの項目と現在地はサイトごとに違うので、引数で受ける。lib/site.ts・lib/paths.ts は読まない（ブログと共有するため）。

import { cls } from "../lib/css.ts";
import { escapeHtml } from "../lib/html.ts";

/** ナビの 1 項目。href は末尾を / にしたサイト内のパスか、外部の URL */
export type NavItem = { href: string; label: string };

/** currentPath はページのパス（現在地の aria-current に使う）。現在地を出さないページ（404）は undefined */
export function siteHeader(navItems: readonly NavItem[], currentPath: string | undefined): string {
  const current = currentNavHref(navItems, currentPath);
  const items = navItems.map((item) => {
    const ariaCurrent = item.href === current ? ` aria-current="page"` : "";

    return `<li><a${ariaCurrent} href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`;
  });
  const nav = `<nav aria-label="メインメニュー"><ul${cls("SiteHeader", "nav")}>${items.join("")}</ul></nav>`;

  return `<header${cls("SiteHeader", "header")}><div${cls("SiteHeader", "band")} aria-hidden="true"></div><div${cls("SiteHeader", "inner")}>${nav}</div></header>`;
}

/** ナビの現在地の href。いちばん長く一致する項目（/ はトップだけ） */
function currentNavHref(navItems: readonly NavItem[], currentPath: string | undefined): string | undefined {
  if (currentPath === undefined) return undefined;

  return navItems
    .map((item) => item.href)
    .filter((href) => (href === "/" ? currentPath === "/" : currentPath.startsWith(href)))
    .sort((a, b) => b.length - a.length)[0];
}
