// ページの HTML。トップ（記事一覧）、月別の一覧、タグの一覧とタグごとの一覧、記事、404 と、共通の <head>、ヘッダー、フッター。
// HTML の構造と class 名は portfolio（Next.js の React コンポーネント）が出すものにそろえる。
// 例外はサイドバー（ブログだけの部品。CSS は src/Sidebar.module.css）と、それを置くための 2 列の枠、
// タグのチップのリンク（src/Tags.module.css）。
// class 名は css.ts が書き換えた名前を classOf で引く。CSS に無い class は、CSS Modules と同じく属性ごと出さない。
// 意図して CSS に無いもの（build.ts の EXPECTED_MISSING_CLASSES）以外があれば、build.ts がビルドを止める。
// 文字は escapeHtml を通す。本文の HTML は shared/lib/markdown.ts が許可リストでサニタイズ済み。
// Marp の HTML は shared/lib/marp.ts が html: false（生の HTML はエスケープ）で変換済み。この 2 つはそのまま埋め込む。
// ただし Marp は html: false でも、記事の <style> をスライドの CSS に、HTML のコメントをディレクティブとして読む。

import { formatDate } from "../shared/lib/format.ts";
import { renderMarkdownWithHeadings, type Heading } from "../shared/lib/markdown.ts";
import { isMarpMarkdown, renderMarp } from "../shared/lib/marp.ts";
import type { PostContent } from "../shared/lib/post-types.ts";
import { groupPostsByMonth, type MonthArchive } from "./archive.ts";
import { classOf, type ModuleName } from "./css.ts";
import {
  absoluteUrl,
  archiveDescription,
  archivePath,
  archiveTitle,
  AUTHOR_NAME,
  CONTENT_SECURITY_POLICY,
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
  PROFILE_BIO,
  PROFILE_ICON,
  PROFILE_LINKS,
  RECENT_POSTS_COUNT,
  SITE_DESCRIPTION,
  SITE_NAME,
  TAG_INDEX_DESCRIPTION,
  TAG_INDEX_EMPTY_TEXT,
  TAG_INDEX_PATH,
  tagDescription,
  tagPath,
  TAGS_TITLE,
  tagTitle,
} from "./site.ts";
import { groupPostsByTag, type TagArchive } from "./tags.ts";

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
  const heading = postListHeading(POST_LIST_TITLE, posts.length);
  const lead = `<p${cls("PostList", "lead")}>${escapeHtml(POST_LIST_LEAD)}</p>`;
  const list = postList(posts);

  return page(ctx, { description: SITE_DESCRIPTION, path: HOME_PATH }, withSidebar(`${heading}${lead}${list}`, posts));
}

/** 月別の一覧ページ。見た目はトップと同じ部品。posts はサイドバーの部品に使う公開済みの全記事（新しい順） */
export function archivePage(archive: MonthArchive, posts: readonly PostContent[], ctx: PageContext): string {
  const title = archiveTitle(archive.month);
  const description = archiveDescription(archive.month);
  const heading = postListHeading(title, archive.posts.length);
  // 説明文は見出しと一覧のあいだの余白も兼ねる（PostList の .lead の margin）
  const lead = `<p${cls("PostList", "lead")}>${escapeHtml(description)}</p>`;
  const list = postList(archive.posts);
  const head = { title, description, path: archivePath(archive.month) };

  return page(ctx, head, withSidebar(`${heading}${lead}${list}`, posts));
}

/** タグの一覧ページ（/tags/）。タグと記事の件数を、記事の多い順に並べる。posts はサイドバーの部品に使う公開済みの全記事（新しい順） */
export function tagIndexPage(posts: readonly PostContent[], ctx: PageContext): string {
  const tags = groupPostsByTag(posts);
  const heading = postListHeading(TAGS_TITLE, tags.length, "個");
  const lead = `<p${cls("PostList", "lead")}>${escapeHtml(TAG_INDEX_DESCRIPTION)}</p>`;
  const list = tags.length === 0 ? `<p${cls("PostList", "empty")}>${escapeHtml(TAG_INDEX_EMPTY_TEXT)}</p>` : tagIndexList(tags);
  const head = { title: TAGS_TITLE, description: TAG_INDEX_DESCRIPTION, path: TAG_INDEX_PATH };

  return page(ctx, head, withSidebar(`${heading}${lead}${list}`, posts));
}

/** タグの一覧。チップと同じ見た目で、文字を大きくする */
function tagIndexList(tags: readonly TagArchive[]): string {
  const items = tags.map(({ tag, posts }) => `<li><a href="${escapeHtml(tagPath(tag))}">${escapeHtml(tag)} (${posts.length})</a></li>`);
  const listClass = classList(["PostList", "chips"], ["Tags", "chips"], ["Tags", "index"]);

  return `<ul${attr("class", listClass)}>${items.join("")}</ul>`;
}

/** タグごとの一覧ページ。見た目は月別の一覧ページと同じ。posts はサイドバーの部品に使う公開済みの全記事（新しい順） */
export function tagPage(archive: TagArchive, posts: readonly PostContent[], ctx: PageContext): string {
  const title = tagTitle(archive.tag);
  const description = tagDescription(archive.tag);
  const heading = postListHeading(title, archive.posts.length);
  const lead = `<p${cls("PostList", "lead")}>${escapeHtml(description)}</p>`;
  const list = postList(archive.posts);
  const head = { title, description, path: tagPath(archive.tag) };

  return page(ctx, head, withSidebar(`${heading}${lead}${list}`, posts));
}

/** 記事一覧の見出しと件数。unit は件数の単位 */
function postListHeading(title: string, count: number, unit = "件"): string {
  return `<div${cls("PostList", "heading")}><h1>${escapeHtml(title)}</h1><p${cls("PostList", "count")}>${count} ${unit}</p></div>`;
}

/** 記事一覧。記事が無いときは POST_LIST_EMPTY_TEXT */
function postList(posts: readonly PostContent[]): string {
  if (posts.length === 0) return `<p${cls("PostList", "empty")}>${escapeHtml(POST_LIST_EMPTY_TEXT)}</p>`;

  return `<ul${cls("PostList", "list")}>${posts.map(postCard).join("")}</ul>`;
}

/** 一覧のページの中身を、右にサイドバーを置いた 2 列で包む。posts はサイドバーの部品に使う公開済みの全記事（新しい順） */
function withSidebar(content: string, posts: readonly PostContent[]): string {
  return `<div${cls("Sidebar", "listLayout")}><div>${content}</div>${listSidebar(posts)}</div>`;
}

/** 記事一覧の 1 件 */
function postCard(post: PostContent): string {
  const cardClass = [classOf("PostList", "card"), classOf("PostList", "post")].filter(Boolean).join(" ");
  const title = `<h2${cls("PostList", "title")}><a href="${escapeHtml(postPath(post.slug))}">${escapeHtml(post.title)}</a></h2>`;
  const summary = `<p${cls("PostList", "summary")}>${escapeHtml(post.summary)}</p>`;
  const date = `<time datetime="${escapeHtml(post.publishedAt)}"${cls("PostList", "date")}>${formatDate(post.publishedAt)}</time>`;

  return `<li${attr("class", cardClass)}><div${cls("PostList", "main")}>${title}${summary}${tagChips(post.tags)}</div>${date}</li>`;
}

/** 記事のタグのチップ。各タグの一覧ページへのリンク。タグが無い記事では出さない */
function tagChips(tags: readonly string[] | undefined): string {
  if (tags === undefined || tags.length === 0) return "";

  const items = tags.map((tag) => `<li><a href="${escapeHtml(tagPath(tag))}">${escapeHtml(tag)}</a></li>`);
  const listClass = classList(["PostList", "chips"], ["Tags", "chips"]);

  return `<ul${attr("class", listClass)} aria-label="${escapeHtml(TAGS_TITLE)}">${items.join("")}</ul>`;
}

/**
 * 記事の詳細ページ。右の列はサイドバーと、その下の目次（無い記事では出さない）。
 * サイドバーはプロフィールだけにする（postSidebar）
 */
export function postPage(post: PostContent, ctx: PageContext): string {
  const isMarp = isMarpMarkdown(post.bodyMarkdown);
  const { html, headings } = isMarp ? { html: "", headings: [] } : renderMarkdownWithHeadings(post.bodyMarkdown);
  const hasToc = headings.length > 0;

  const aside = hasToc ? `<aside${cls("PostDetail", "aside")}>${tableOfContents(headings)}</aside>` : "";
  const column = `<div${cls("Sidebar", "column")}>${postSidebar()}${aside}</div>`;
  const body = isMarp ? marpDeck(post.bodyMarkdown, ctx.assets) : `<div${cls("PostDetail", "body")}>${html}</div>`;
  const backLabel = `${POST_LIST_TITLE}へ戻る`;
  const footer = `<footer${cls("PostDetail", "footer")}><p><a${cls("PostDetail", "back")} href="${HOME_PATH}">← ${escapeHtml(backLabel)}</a></p></footer>`;
  const main = `<article${cls("Sidebar", "postLayout")}>${postHeader(post)}${column}<div${cls("PostDetail", "content")}>${body}${footer}</div></article>`;

  const article = { publishedTime: post.publishedAt, updatedTime: post.updatedAt };

  return page(ctx, { title: post.title, description: post.summary, path: postPath(post.slug), article }, main);
}

/** 記事の冒頭（パンくずリスト、公開日と更新日、タイトル、概要、タグ） */
function postHeader(post: PostContent): string {
  const breadcrumb = `<nav aria-label="パンくずリスト"><ol${cls("PostDetail", "breadcrumb")}><li><a href="${HOME_PATH}">${escapeHtml(POST_LIST_TITLE)}</a></li><li aria-current="page">${escapeHtml(post.title)}</li></ol></nav>`;
  const title = `<h1${cls("PostDetail", "title")}>${escapeHtml(post.title)}</h1>`;
  const summary = `<p${cls("PostDetail", "summary")}>${escapeHtml(post.summary)}</p>`;

  return `<header${cls("PostDetail", "header")}>${breadcrumb}${postDates(post)}${title}${summary}${tagChips(post.tags)}</header>`;
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

/**
 * 一覧のページ（トップ、タグ、月別）のサイドバー。プロフィール、最近の記事、タグ、月別の順に並べる。
 * posts は公開済みの全記事（新しい順）
 */
function listSidebar(posts: readonly PostContent[]): string {
  return sidebar([profileSection(), recentPostsSection(posts), tagsSection(posts), monthsSection(posts)]);
}

/**
 * 記事ページのサイドバー。プロフィールだけを出す。
 * 1280×800 の画面で、記事を開いた時点で下の目次が画面に入るようにするため
 */
function postSidebar(): string {
  return sidebar([profileSection()]);
}

/** サイドバー。区画を上から順に並べる。部品を足すときは、区画を返す関数を作って listSidebar か postSidebar に並べる */
function sidebar(sections: readonly string[]): string {
  return `<aside${cls("Sidebar", "sidebar")} aria-label="サイドバー">${sections.join("")}</aside>`;
}

/** サイドバーの区画（見出しと中身） */
function sidebarSection(title: string, content: string): string {
  return `<section${cls("Sidebar", "section")}><h2${cls("Sidebar", "heading")}>${escapeHtml(title)}</h2>${content}</section>`;
}

/** プロフィール（アイコン、名前、一言、リンク）。アイコンは名前と並べるため alt を空にする */
function profileSection(): string {
  const { path, size } = PROFILE_ICON;
  const icon = `<img${cls("Sidebar", "avatar")} src="${escapeHtml(path)}" alt="" width="${size}" height="${size}"/>`;
  const name = `<p${cls("Sidebar", "name")}>${escapeHtml(AUTHOR_NAME)}</p>`;
  const bio = `<p${cls("Sidebar", "bio")}>${escapeHtml(PROFILE_BIO)}</p>`;
  const links = PROFILE_LINKS.map(
    (link) => `<a href="${escapeHtml(link.href)}" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`,
  );
  const profile = `<div${cls("Sidebar", "profile")}>${icon}<div>${name}${bio}</div></div>`;

  return sidebarSection("プロフィール", `${profile}<p${cls("Sidebar", "links")}>${links.join(" ・ ")}</p>`);
}

/** 最近の記事（新しい順に RECENT_POSTS_COUNT 件） */
function recentPostsSection(posts: readonly PostContent[]): string {
  const items = posts
    .slice(0, RECENT_POSTS_COUNT)
    .map((post) => `<li><a href="${escapeHtml(postPath(post.slug))}">${escapeHtml(post.title)}</a></li>`);

  return sidebarSection("最近の記事", `<ul${cls("Sidebar", "recent")}>${items.join("")}</ul>`);
}

/** タグ（タグと件数。記事の多い順）。各タグの一覧ページへのリンク。タグが 1 つも無ければ区画を出さない */
function tagsSection(posts: readonly PostContent[]): string {
  const tags = groupPostsByTag(posts);
  if (tags.length === 0) return "";

  const items = tags.map(({ tag, posts: tagPosts }) => {
    const link = `<a href="${escapeHtml(tagPath(tag))}">${escapeHtml(tag)}</a>`;

    return `<li>${link} <span${cls("Sidebar", "tagCount")}>(${tagPosts.length})</span></li>`;
  });

  return sidebarSection(TAGS_TITLE, `<ul${cls("Sidebar", "tags")}>${items.join("")}</ul>`);
}

/** 月別（年月と件数。新しい順）。各月の一覧ページへのリンク */
function monthsSection(posts: readonly PostContent[]): string {
  const items = groupPostsByMonth(posts).map(({ month, posts: monthPosts }) => {
    const link = `<a href="${escapeHtml(archivePath(month))}">${escapeHtml(month)}</a>`;

    return `<li>${link} <span${cls("Sidebar", "monthCount")}>(${monthPosts.length})</span></li>`;
  });

  return sidebarSection("月別", `<ul${cls("Sidebar", "months")}>${items.join("")}</ul>`);
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
  // og:title は、ページのメタデータを持つページ（トップ、月別とタグの一覧、記事）だけがタイトル入り。404 はサイト名（Next.js 版と同じ）
  const ogTitle = path !== undefined ? fullTitle : SITE_NAME;
  const url = path !== undefined ? absoluteUrl(path) : undefined;
  const image = absoluteUrl(OG_IMAGE.path);
  const imageWidth = String(OG_IMAGE.width);
  const imageHeight = String(OG_IMAGE.height);

  return [
    meta({ charset: "utf-8" }),
    meta({ name: "viewport", content: "width=device-width, initial-scale=1" }),
    meta({ "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY }),
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

/** 複数の class をまとめた class 属性の値（CSS に無い class は外す。1 つも無ければ undefined） */
function classList(...names: readonly [ModuleName, string][]): string | undefined {
  const classes = names.map(([module, name]) => classOf(module, name)).filter((name) => name !== undefined);

  return classes.length === 0 ? undefined : classes.join(" ");
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
