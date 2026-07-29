"use client";

// ヘッダーのナビ。現在地（aria-current）の判定にパスが要るので、ここだけクライアントで描画する。
// 項目はサイトごとに違うので、SiteHeader を通して外から受け取る。

import Link from "next/link";
import { usePathname } from "next/navigation";

/** ナビの 1 項目。href は末尾を / にしたサイト内のパス */
export type NavItem = { href: string; label: string };

/** 現在のパスに当たる項目。下の階層にいるときはいちばん長く一致する項目（/about/ と /about/site/ があり、/about/site/ にいるなら /about/site/） */
function currentHref(items: readonly NavItem[], pathname: string): string | undefined {
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return items
    .map((item) => item.href)
    .filter((href) => (href === "/" ? path === "/" : path.startsWith(href)))
    .sort((a, b) => b.length - a.length)[0];
}

export function NavLinks({ items, className }: { items: readonly NavItem[]; className: string }) {
  const current = currentHref(items, usePathname());
  return (
    <ul className={className}>
      {items.map((item) => (
        <li key={item.href}>
          <Link href={item.href} aria-current={item.href === current ? "page" : undefined}>
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
