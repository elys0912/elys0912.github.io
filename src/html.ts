// ページの HTML。トップ（記事一覧）、記事、404 と、共通の <head>、ヘッダー、フッター。
// HTML の構造と class 名は portfolio（Next.js の React コンポーネント）が出すものにそろえる。
// class 名は css.ts が書き換えた名前を classOf で引く。CSS に無い class は、CSS Modules と同じく属性ごと出さない。
// 文字は escapeHtml を通す。本文の HTML は shared/lib/markdown.ts が許可リストでサニタイズしたもの、
// Marp の HTML は shared/lib/marp.ts が html: false（生の HTML はエスケープ）で変換したものなので、そのまま埋め込む。

import { formatDate } from "../shared/lib/format.ts";
import { renderMarkdownWithHeadings, type Heading } from "../shared/lib/markdown.ts";
import { isMarpMarkdown, renderMarp } from "../shared/lib/marp.ts";
import type { PostContent } from "../shared/lib/post-types.ts";
import { classOf, type ModuleName } from "./css.ts";
import {
  absoluteUrl,
  AUTHOR_NAME,
  FEED_PATH,
  FOOTER_LINKS,
  HISTORY_BACK_LABEL,
  HOME_PATH,
  NAV_ITEMS,
  OG_IMAGE,
  POST_LIST_EMPTY_TEXT,
  POST_LIST_LEAD,
  POST_LIST_TITLE,
  postPath,
  SITE_DESCRIPTION,
  SITE_NAME,
} from "./site.ts";

/** ページの <head> と本文の外側（CSS とスクリプトの URL）に使う、out/ の中のファイルの URL（?v= 付き） */
export type Assets = { css: string; script: string; marpScript: string };

type HeadOptions = {
  /** 省略するとサイト名だけのタイトルになる */
  title?: string;
  description: string;
  /** ページのパス。og:url と canonical に使う。省略すると出さない（404） */
  path?: string;
  article?: { publishedTime: string; updatedTime: string };
  noindex?: boolean;
};

/** トップページ（記事一覧） */
export function homePage(posts: readonly PostContent[], assets: Assets, now: Date): string {
  const cards = posts.map((post) => {
    const card = [classOf("PostList", "card"), classOf("PostList", "post")].filter(Boolean).join(" ");
    return (
      `<li${attr("class", card)}><div${attr("class", classOf("PostList", "main"))}>` +
      `<h2${cls("PostList", "title")}><a href="${escapeHtml(postPath(post.slug))}">${escapeHtml(post.title)}</a></h2>` +
      `<p${cls("PostList", "summary")}>${escapeHtml(post.summary)}</p></div>` +
      `<time datetime="${escapeHtml(post.publishedAt)}"${cls("PostList", "date")}>${formatDate(post.publishedAt)}</time></li>`
    );
  });
  const main =
    `<div${cls("PostList", "heading")}><h1>${escapeHtml(POST_LIST_TITLE)}</h1><p${cls("PostList", "count")}>${posts.length} 件</p></div>` +
    `<p${cls("PostList", "lead")}>${escapeHtml(POST_LIST_LEAD)}</p>` +
    (posts.length === 0
      ? `<p${cls("PostList", "empty")}>${escapeHtml(POST_LIST_EMPTY_TEXT)}</p>`
      : `<ul${cls("PostList", "list")}>${cards.join("")}</ul>`);
  return page({ description: SITE_DESCRIPTION, path: HOME_PATH }, HOME_PATH, main, assets, now);
}

/** 記事の詳細ページ */
export function postPage(post: PostContent, assets: Assets, now: Date): string {
  const publishedDate = formatDate(post.publishedAt);
  const updatedDate = formatDate(post.updatedAt);
  // 日本時間で公開日と違う日に更新したときだけ出す。公開後の更新に限る
  const showUpdated = updatedDate !== publishedDate && Date.parse(post.updatedAt) > Date.parse(post.publishedAt);

  const marp = isMarpMarkdown(post.bodyMarkdown);
  const { html, headings } = marp ? { html: "", headings: [] } : renderMarkdownWithHeadings(post.bodyMarkdown);
  const hasToc = headings.length > 0;
  const backLabel = `${POST_LIST_TITLE}へ戻る`;

  const header =
    `<header${cls("PostDetail", "header")}><nav aria-label="パンくずリスト"><ol${cls("PostDetail", "breadcrumb")}>` +
    `<li><a href="${HOME_PATH}">${escapeHtml(POST_LIST_TITLE)}</a></li><li aria-current="page">${escapeHtml(post.title)}</li></ol></nav>` +
    `<p${cls("PostDetail", "dates")}><span>公開日 <time datetime="${escapeHtml(post.publishedAt)}">${publishedDate}</time></span>` +
    (showUpdated ? `<span>更新日 <time datetime="${escapeHtml(post.updatedAt)}">${updatedDate}</time></span>` : "") +
    `</p><h1${cls("PostDetail", "title")}>${escapeHtml(post.title)}</h1>` +
    `<p${cls("PostDetail", "summary")}>${escapeHtml(post.summary)}</p></header>`;
  const aside = hasToc ? `<aside${cls("PostDetail", "aside")}>${tableOfContents(headings)}</aside>` : "";
  const body = marp
    ? marpDeck(post.bodyMarkdown, assets)
    : `<div${cls("PostDetail", "body")}>${html}</div>`;
  const footer =
    `<footer${cls("PostDetail", "footer")}><p><a${cls("PostDetail", "back")} href="${HOME_PATH}">← ${escapeHtml(backLabel)}</a></p></footer>`;
  const layout = `${classOf("PostDetail", "layout") ?? ""} ${hasToc ? (classOf("PostDetail", "withToc") ?? "") : ""}`;
  const main = `<article${attr("class", layout)}>${header}${aside}<div${cls("PostDetail", "content")}>${body}${footer}</div></article>`;

  return page(
    {
      title: post.title,
      description: post.summary,
      path: postPath(post.slug),
      article: { publishedTime: post.publishedAt, updatedTime: post.updatedAt },
    },
    postPath(post.slug),
    main,
    assets,
    now,
  );
}

/** 404（GitHub Pages は 404.html を返す） */
export function notFoundPage(assets: Assets, now: Date): string {
  const main =
    `<h1>ページが見つかりません</h1><p>お探しのページは移動または削除された可能性があります。</p>` +
    `<p><a href="${HOME_PATH}">${escapeHtml(POST_LIST_TITLE)}へ戻る</a></p>`;
  return page({ title: "ページが見つかりません", description: SITE_DESCRIPTION, noindex: true }, undefined, main, assets, now);
}

/** 目次。項目は本文の h2。読み始めは最初の見出しを現在地にする（現在地の追従は src/client.js） */
function tableOfContents(headings: readonly Heading[]): string {
  const items = headings.map(
    (heading, index) =>
      `<li><a href="#${escapeHtml(heading.id)}"${index === 0 ? ` aria-current="location"` : ""}>${escapeHtml(heading.text)}</a></li>`,
  );
  return (
    `<nav${cls("TableOfContents", "toc")} aria-labelledby="toc-heading">` +
    `<p id="toc-heading"${cls("TableOfContents", "heading")}>目次</p>` +
    `<ol${cls("TableOfContents", "list")}>${items.join("")}</ol></nav>`
  );
}

/** Marp のスライド。テーマの CSS は div.marpit の下にスコープされている。文字の自動縮小などは marp-core の browser script が当てる */
function marpDeck(markdown: string, assets: Assets): string {
  const { html, css } = renderMarp(markdown);
  if (/<\/style/i.test(css)) throw new Error("Marp の CSS に </style が含まれています");
  return `<div${cls("MarpDeck", "deck")}><style>${css}</style><div>${html}</div></div><script src="${assets.marpScript}" defer></script>`;
}

/** ページ全体。currentPath はナビの現在地（aria-current）の判定に使う */
function page(head: HeadOptions, currentPath: string | undefined, main: string, assets: Assets, now: Date): string {
  return (
    `<!DOCTYPE html><html lang="ja"><head>${headTags(head, assets)}</head><body>` +
    siteHeader(currentPath) +
    `<main${cls("layout", "main")}>${main}</main>` +
    siteFooter(now) +
    `<script src="${assets.script}" defer></script></body></html>\n`
  );
}

function headTags({ title, description, path, article, noindex }: HeadOptions, assets: Assets): string {
  // <title> と og:title はどちらも「タイトル | サイト名」。タイトルが無いページ（トップ）はサイト名だけ
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  // og:title は、ページのメタデータを持つページ（トップと記事）だけがタイトル入り。404 はサイト名（Next.js 版と同じ）
  const ogTitle = path !== undefined ? fullTitle : SITE_NAME;
  const url = path !== undefined ? absoluteUrl(path) : undefined;
  const image = absoluteUrl(OG_IMAGE.path);
  const tags: [string, Record<string, string>][] = [
    ["meta", { charset: "utf-8" }],
    ["meta", { name: "viewport", content: "width=device-width, initial-scale=1" }],
    ["link", { rel: "stylesheet", href: assets.css }],
    ...(noindex ? [["meta", { name: "robots", content: "noindex" }] as [string, Record<string, string>]] : []),
    ["title", {}],
    ["meta", { name: "description", content: description }],
    ...(url ? [["link", { rel: "canonical", href: url }] as [string, Record<string, string>]] : []),
    ["link", { rel: "alternate", type: "application/atom+xml", href: absoluteUrl(FEED_PATH), title: SITE_NAME }],
    ...og("og:title", ogTitle),
    ...og("og:description", description),
    ...(url ? og("og:url", url) : []),
    ...og("og:site_name", SITE_NAME),
    ...og("og:locale", "ja_JP"),
    ...og("og:image", image),
    ...og("og:image:width", String(OG_IMAGE.width)),
    ...og("og:image:height", String(OG_IMAGE.height)),
    ...og("og:image:alt", OG_IMAGE.alt),
    ...og("og:type", article ? "article" : "website"),
    ...(article ? og("article:published_time", article.publishedTime) : []),
    // 公開後に更新したときだけ入れる
    ...(article && Date.parse(article.updatedTime) > Date.parse(article.publishedTime)
      ? og("article:modified_time", article.updatedTime)
      : []),
    ...twitter("twitter:card", "summary_large_image"),
    ...twitter("twitter:title", ogTitle),
    ...twitter("twitter:description", description),
    ...twitter("twitter:image", image),
    ...twitter("twitter:image:alt", OG_IMAGE.alt),
    ...twitter("twitter:image:width", String(OG_IMAGE.width)),
    ...twitter("twitter:image:height", String(OG_IMAGE.height)),
    ["link", { rel: "icon", href: "/favicon.ico", sizes: "48x48", type: "image/x-icon" }],
    ["link", { rel: "icon", href: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
    ["link", { rel: "apple-touch-icon", href: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  ];
  return tags
    .map(([tag, attrs]) =>
      tag === "title"
        ? `<title>${escapeHtml(fullTitle)}</title>`
        : `<${tag}${Object.entries(attrs).map(([name, value]) => attr(name, value)).join("")}/>`,
    )
    .join("");
}

function og(property: string, content: string): [string, Record<string, string>][] {
  return [["meta", { property, content }]];
}

function twitter(name: string, content: string): [string, Record<string, string>][] {
  return [["meta", { name, content }]];
}

/** ヘッダー。ナビの現在地は、いちばん長く一致する項目（/ はトップだけ） */
function siteHeader(currentPath: string | undefined): string {
  const current =
    currentPath === undefined
      ? undefined
      : NAV_ITEMS.map((item) => item.href)
          .filter((href) => (href === "/" ? currentPath === "/" : currentPath.startsWith(href)))
          .sort((a, b) => b.length - a.length)[0];
  const items = NAV_ITEMS.map(
    (item) =>
      `<li><a${item.href === current ? ` aria-current="page"` : ""} href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`,
  );
  return (
    `<header${cls("SiteHeader", "header")}><div${cls("SiteHeader", "band")} aria-hidden="true"></div>` +
    `<div${cls("SiteHeader", "inner")}><nav aria-label="メインメニュー"><ul${cls("SiteHeader", "nav")}>${items.join("")}</ul></nav></div></header>`
  );
}

/**
 * フッター。著作権の表示の年は、ビルド環境（CI は UTC）に左右されないよう日本時間で数える。
 * 「前のページへ戻る」は履歴があるときだけ src/client.js が足す（data-back-button に文言と class を渡す）
 */
function siteFooter(now: Date): string {
  const year = formatDate(now.toISOString()).slice(0, 4);
  const links = FOOTER_LINKS.map(
    (link) => `<span> ・ <a href="${escapeHtml(link.href)}" rel="noopener noreferrer">${escapeHtml(link.label)}</a></span>`,
  );
  return (
    `<footer${cls("SiteFooter", "footer")}><p${cls("SiteFooter", "inner")}${attr("data-back-label", HISTORY_BACK_LABEL)}${attr("data-back-class", classOf("FooterBackButton", "button"))}>` +
    `© ${year} ${escapeHtml(AUTHOR_NAME)}${links.join("")}</p></footer>`
  );
}

/** class 属性（CSS に無い class なら出さない） */
function cls(module: ModuleName, name: string): string {
  return attr("class", classOf(module, name));
}

/** 属性。値が undefined なら出さない */
function attr(name: string, value: string | undefined): string {
  return value === undefined ? "" : ` ${name}="${escapeHtml(value)}"`;
}

/** テキストと属性値のエスケープ（React と同じ 5 文字） */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => htmlEntities[char]);
}

const htmlEntities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};
