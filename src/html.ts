// ページの HTML。トップ（記事一覧）、記事、404 と、共通の <head>、ヘッダー、フッター。
// HTML の構造と class 名は portfolio（Next.js の React コンポーネント）が出すものにそろえる。
// class 名は css.ts が書き換えた名前を classOf で引く。CSS に無い class は、CSS Modules と同じく属性ごと出さない。
// 文字は escapeHtml を通す。本文の HTML は shared/lib/markdown.ts が許可リストでサニタイズ済み。
// Marp の HTML は shared/lib/marp.ts が html: false（生の HTML はエスケープ）で変換済み。この 2 つはそのまま埋め込む。

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

/** どのページにも共通して渡すもの。now はフッターの年に使う */
export type PageContext = { assets: Assets; now: Date };

type HeadOptions = {
  /** 省略するとサイト名だけのタイトルになる */
  title?: string;
  description: string;
  /** ページのパス。og:url と canonical、ナビの現在地に使う。省略すると出さない（404） */
  path?: string;
  article?: { publishedTime: string; updatedTime: string };
  noindex?: boolean;
};

/** トップページ（記事一覧） */
export function homePage(posts: readonly PostContent[], ctx: PageContext): string {
  const heading = `<div${cls("PostList", "heading")}><h1>${escapeHtml(POST_LIST_TITLE)}</h1><p${cls("PostList", "count")}>${posts.length} 件</p></div>`;
  const lead = `<p${cls("PostList", "lead")}>${escapeHtml(POST_LIST_LEAD)}</p>`;
  const list =
    posts.length === 0
      ? `<p${cls("PostList", "empty")}>${escapeHtml(POST_LIST_EMPTY_TEXT)}</p>`
      : `<ul${cls("PostList", "list")}>${posts.map(postCard).join("")}</ul>`;

  return page(ctx, { description: SITE_DESCRIPTION, path: HOME_PATH }, `${heading}${lead}${list}`);
}

/** 記事一覧の 1 件 */
function postCard(post: PostContent): string {
  const cardClass = [classOf("PostList", "card"), classOf("PostList", "post")].filter(Boolean).join(" ");
  const title = `<h2${cls("PostList", "title")}><a href="${escapeHtml(postPath(post.slug))}">${escapeHtml(post.title)}</a></h2>`;
  const summary = `<p${cls("PostList", "summary")}>${escapeHtml(post.summary)}</p>`;
  const date = `<time datetime="${escapeHtml(post.publishedAt)}"${cls("PostList", "date")}>${formatDate(post.publishedAt)}</time>`;

  return `<li${attr("class", cardClass)}><div${cls("PostList", "main")}>${title}${summary}</div>${date}</li>`;
}

/** 記事の詳細ページ */
export function postPage(post: PostContent, ctx: PageContext): string {
  const isMarp = isMarpMarkdown(post.bodyMarkdown);
  const { html, headings } = isMarp ? { html: "", headings: [] } : renderMarkdownWithHeadings(post.bodyMarkdown);
  const hasToc = headings.length > 0;

  const aside = hasToc ? `<aside${cls("PostDetail", "aside")}>${tableOfContents(headings)}</aside>` : "";
  const body = isMarp ? marpDeck(post.bodyMarkdown, ctx.assets) : `<div${cls("PostDetail", "body")}>${html}</div>`;
  const backLabel = `${POST_LIST_TITLE}へ戻る`;
  const footer = `<footer${cls("PostDetail", "footer")}><p><a${cls("PostDetail", "back")} href="${HOME_PATH}">← ${escapeHtml(backLabel)}</a></p></footer>`;
  const withTocClass = hasToc ? (classOf("PostDetail", "withToc") ?? "") : "";
  const layoutClass = `${classOf("PostDetail", "layout") ?? ""} ${withTocClass}`;
  const main = `<article${attr("class", layoutClass)}>${postHeader(post)}${aside}<div${cls("PostDetail", "content")}>${body}${footer}</div></article>`;

  const article = { publishedTime: post.publishedAt, updatedTime: post.updatedAt };

  return page(ctx, { title: post.title, description: post.summary, path: postPath(post.slug), article }, main);
}

/** 記事の冒頭（パンくずリスト、公開日と更新日、タイトル、概要） */
function postHeader(post: PostContent): string {
  const breadcrumb = `<nav aria-label="パンくずリスト"><ol${cls("PostDetail", "breadcrumb")}><li><a href="${HOME_PATH}">${escapeHtml(POST_LIST_TITLE)}</a></li><li aria-current="page">${escapeHtml(post.title)}</li></ol></nav>`;
  const title = `<h1${cls("PostDetail", "title")}>${escapeHtml(post.title)}</h1>`;
  const summary = `<p${cls("PostDetail", "summary")}>${escapeHtml(post.summary)}</p>`;

  return `<header${cls("PostDetail", "header")}>${breadcrumb}${postDates(post)}${title}${summary}</header>`;
}

function postDates(post: PostContent): string {
  const publishedDate = formatDate(post.publishedAt);
  const updatedDate = formatDate(post.updatedAt);
  const published = `<span>公開日 <time datetime="${escapeHtml(post.publishedAt)}">${publishedDate}</time></span>`;
  // 日本時間で公開日と違う日に更新したときだけ出す。公開後の更新に限る
  const isUpdateShown = updatedDate !== publishedDate && Date.parse(post.updatedAt) > Date.parse(post.publishedAt);
  const updated = isUpdateShown ? `<span>更新日 <time datetime="${escapeHtml(post.updatedAt)}">${updatedDate}</time></span>` : "";

  return `<p${cls("PostDetail", "dates")}>${published}${updated}</p>`;
}

/** 404（GitHub Pages は 404.html を返す） */
export function notFoundPage(ctx: PageContext): string {
  const message = `<h1>ページが見つかりません</h1><p>お探しのページは移動または削除された可能性があります。</p>`;
  const back = `<p><a href="${HOME_PATH}">${escapeHtml(POST_LIST_TITLE)}へ戻る</a></p>`;

  return page(ctx, { title: "ページが見つかりません", description: SITE_DESCRIPTION, noindex: true }, `${message}${back}`);
}

/** 目次。項目は本文の h2。初期表示では最初の見出しを現在地にする（現在地の追従は src/client.js） */
function tableOfContents(headings: readonly Heading[]): string {
  const items = headings.map((heading, index) => {
    const current = index === 0 ? ` aria-current="location"` : "";

    return `<li><a href="#${escapeHtml(heading.id)}"${current}>${escapeHtml(heading.text)}</a></li>`;
  });
  const heading = `<p id="toc-heading"${cls("TableOfContents", "heading")}>目次</p>`;

  return `<nav${cls("TableOfContents", "toc")} aria-labelledby="toc-heading">${heading}<ol${cls("TableOfContents", "list")}>${items.join("")}</ol></nav>`;
}

/** Marp のスライド。テーマの CSS は div.marpit の下にスコープされている。文字の自動縮小などは marp-core の browser script が当てる */
function marpDeck(markdown: string, assets: Assets): string {
  const { html, css } = renderMarp(markdown);
  if (/<\/style/i.test(css)) throw new Error("Marp の CSS に </style が含まれています");

  return `<div${cls("MarpDeck", "deck")}><style>${css}</style><div>${html}</div></div><script src="${assets.marpScript}" defer></script>`;
}

/** ページ全体。head.path はナビの現在地（aria-current）の判定にも使う */
function page({ assets, now }: PageContext, head: HeadOptions, main: string): string {
  const body = `${siteHeader(head.path)}<main${cls("layout", "main")}>${main}</main>${siteFooter(now)}<script src="${assets.script}" defer></script>`;

  return `<!DOCTYPE html><html lang="ja"><head>${headTags(head, assets)}</head><body>${body}</body></html>\n`;
}

function headTags({ title, description, path, article, noindex }: HeadOptions, assets: Assets): string {
  // <title> と og:title はどちらも「タイトル | サイト名」。タイトルが無いページ（トップ）はサイト名だけ
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  // og:title は、ページのメタデータを持つページ（トップと記事）だけがタイトル入り。404 はサイト名（Next.js 版と同じ）
  const ogTitle = path !== undefined ? fullTitle : SITE_NAME;
  const url = path !== undefined ? absoluteUrl(path) : undefined;
  const image = absoluteUrl(OG_IMAGE.path);
  const imageWidth = String(OG_IMAGE.width);
  const imageHeight = String(OG_IMAGE.height);

  return [
    meta({ charset: "utf-8" }),
    meta({ name: "viewport", content: "width=device-width, initial-scale=1" }),
    link({ rel: "stylesheet", href: assets.css }),
    noindex ? meta({ name: "robots", content: "noindex" }) : "",
    `<title>${escapeHtml(fullTitle)}</title>`,
    meta({ name: "description", content: description }),
    url === undefined ? "" : link({ rel: "canonical", href: url }),
    link({ rel: "alternate", type: "application/atom+xml", href: absoluteUrl(FEED_PATH), title: SITE_NAME }),
    og("og:title", ogTitle),
    og("og:description", description),
    og("og:url", url),
    og("og:site_name", SITE_NAME),
    og("og:locale", "ja_JP"),
    og("og:image", image),
    og("og:image:width", imageWidth),
    og("og:image:height", imageHeight),
    og("og:image:alt", OG_IMAGE.alt),
    og("og:type", article ? "article" : "website"),
    og("article:published_time", article?.publishedTime),
    og("article:modified_time", modifiedTime(article)),
    meta({ name: "twitter:card", content: "summary_large_image" }),
    meta({ name: "twitter:title", content: ogTitle }),
    meta({ name: "twitter:description", content: description }),
    meta({ name: "twitter:image", content: image }),
    meta({ name: "twitter:image:alt", content: OG_IMAGE.alt }),
    meta({ name: "twitter:image:width", content: imageWidth }),
    meta({ name: "twitter:image:height", content: imageHeight }),
    link({ rel: "icon", href: "/favicon.ico", sizes: "48x48", type: "image/x-icon" }),
    link({ rel: "icon", href: "/icon.svg", sizes: "any", type: "image/svg+xml" }),
    link({ rel: "apple-touch-icon", href: "/apple-icon.png", sizes: "180x180", type: "image/png" }),
  ].join("");
}

/** article:modified_time に入れる日時。公開後に更新したときだけ */
function modifiedTime(article: HeadOptions["article"]): string | undefined {
  if (article === undefined) return undefined;

  return Date.parse(article.updatedTime) > Date.parse(article.publishedTime) ? article.updatedTime : undefined;
}

function meta(attrs: Record<string, string>): string {
  return `<meta${attrList(attrs)}/>`;
}

function link(attrs: Record<string, string>): string {
  return `<link${attrList(attrs)}/>`;
}

/** OGP の <meta property>。content が undefined なら出さない */
function og(property: string, content: string | undefined): string {
  return content === undefined ? "" : meta({ property, content });
}

/** ヘッダー */
function siteHeader(currentPath: string | undefined): string {
  const current = currentNavHref(currentPath);
  const items = NAV_ITEMS.map((item) => {
    const ariaCurrent = item.href === current ? ` aria-current="page"` : "";

    return `<li><a${ariaCurrent} href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`;
  });
  const nav = `<nav aria-label="メインメニュー"><ul${cls("SiteHeader", "nav")}>${items.join("")}</ul></nav>`;

  return `<header${cls("SiteHeader", "header")}><div${cls("SiteHeader", "band")} aria-hidden="true"></div><div${cls("SiteHeader", "inner")}>${nav}</div></header>`;
}

/** ナビの現在地の href。いちばん長く一致する項目（/ はトップだけ） */
function currentNavHref(currentPath: string | undefined): string | undefined {
  if (currentPath === undefined) return undefined;

  return NAV_ITEMS.map((item) => item.href)
    .filter((href) => (href === "/" ? currentPath === "/" : currentPath.startsWith(href)))
    .sort((a, b) => b.length - a.length)[0];
}

/**
 * フッター。著作権の表示の年は日本時間で数える。ビルド環境（CI は UTC）の時差の影響を避けるため。
 * 「前のページへ戻る」は履歴があるときだけ src/client.js が足す（data-back-label と data-back-class に文言と class を渡す）
 */
function siteFooter(now: Date): string {
  const year = formatDate(now.toISOString()).slice(0, 4);
  const links = FOOTER_LINKS.map(
    (link) => `<span> ・ <a href="${escapeHtml(link.href)}" rel="noopener noreferrer">${escapeHtml(link.label)}</a></span>`,
  );
  const backButton = `${attr("data-back-label", HISTORY_BACK_LABEL)}${attr("data-back-class", classOf("FooterBackButton", "button"))}`;

  return `<footer${cls("SiteFooter", "footer")}><p${cls("SiteFooter", "inner")}${backButton}>© ${year} ${escapeHtml(AUTHOR_NAME)}${links.join("")}</p></footer>`;
}

/** class 属性（CSS に無い class なら出さない） */
function cls(module: ModuleName, name: string): string {
  return attr("class", classOf(module, name));
}

/** 属性を並べる。値は escapeHtml を通す */
function attrList(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([name, value]) => attr(name, value))
    .join("");
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
