// ページの HTML。トップ（記事一覧）、月別の一覧、タグの一覧とタグごとの一覧、記事、プライバシーポリシー、404 と、共通の <head>、ヘッダー、フッター。
// ヘッダー、目次、Marp、詳細の見出しと日付、一覧の見出しは、portfolio と共有する部品（shared/parts/）を、このサイトの値を渡して呼ぶ。
// 一覧のカード、フッター、<head>、ページの骨格は、portfolio の部品が出す構造と class 名にそろえて、ここに書く。
// 例外はサイドバー（ブログだけの部品。CSS は src/Sidebar.module.css）と、それを置くための 2 列の枠、
// タグのチップのリンク（src/Tags.module.css）、記事の末尾の前後の記事と関連する記事（src/PostExtras.module.css）。
// class 名は shared/lib/css.ts が書き換えた名前を classOf で引く。CSS に無い class は、CSS Modules と同じく属性ごと出さない。
// 意図して CSS に無いもの（build.ts の EXPECTED_MISSING_CLASSES）以外があれば、build.ts がビルドを止める。
// 文字は escapeHtml を通す。本文の HTML は shared/lib/markdown.ts が許可リストでサニタイズ済み。
// Marp の HTML は shared/lib/marp.ts が html: false（生の HTML はエスケープ）で変換済み。この 2 つはそのまま埋め込む。
// ただし Marp は html: false でも、記事の <style> をスライドの CSS に、HTML のコメントをディレクティブとして読む。

import { classList, classOf, cls } from "../shared/lib/css.ts";
import { formatDate, formatYear } from "../shared/lib/format.ts";
import { attr, attrList, escapeHtml } from "../shared/lib/html.ts";
import { renderMarkdownWithHeadings } from "../shared/lib/markdown.ts";
import { isMarpMarkdown } from "../shared/lib/marp.ts";
import type { PostContent } from "../shared/lib/post-types.ts";
import { marpDeck } from "../shared/parts/marp-deck.ts";
import { postHeader } from "../shared/parts/post-header.ts";
import { postListHeading, postListLead } from "../shared/parts/post-list-heading.ts";
import { siteHeader } from "../shared/parts/site-header.ts";
import { tableOfContents } from "../shared/parts/table-of-contents.ts";
import { groupPostsByMonth, type MonthArchive } from "./archive.ts";
import { isUpdatedAfterPublished } from "./posts.ts";
import {
  absoluteUrl,
  archiveDescription,
  archivePath,
  archiveTitle,
  AUTHOR_NAME,
  CONTENT_SECURITY_POLICY,
  FEED_PATH,
  FOOTER_LINKS,
  GOATCOUNTER_ENDPOINT,
  HOME_PATH,
  NAV_ITEMS,
  OG_IMAGE,
  ogImagePath,
  POST_LIST_EMPTY_TEXT,
  POST_LIST_LEAD,
  POST_LIST_TITLE,
  postPath,
  PRIVACY_PATH,
  PRIVACY_TITLE,
  PROFILE_BIO,
  PROFILE_ICON,
  PROFILE_LINKS,
  RECENT_POSTS_COUNT,
  RELATED_POSTS_COUNT,
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
import { groupPostsByTag, relatedPostsOf, type TagArchive } from "./tags.ts";

/** ページの <head> と本文の外側（CSS とスクリプトの URL）に使う、out/ の中のファイルの URL（?v= 付き） */
type Assets = { css: string; script: string; marpScript: string; counterScript: string };

/** どのページにも共通して渡すもの。now はフッターの年に使う */
export type PageContext = { assets: Assets; now: Date };

type HeadOptions = {
  /** 省略するとサイト名だけのタイトルになる */
  title?: string;
  description: string;
  /** ページのパス。og:url と canonical、ナビの現在地に使う。省略すると出さない（404） */
  path?: string;
  article?: { publishedTime: string; updatedTime: string };
  /** OGP 画像。省略するとサイト全体の画像（OG_IMAGE）になる。大きさは OG_IMAGE と同じ */
  image?: { path: string; alt: string };
  noindex?: boolean;
};

/** トップページ（記事一覧） */
export function homePage(posts: readonly PostContent[], ctx: PageContext): string {
  const head = { description: SITE_DESCRIPTION, path: HOME_PATH };
  const heading = postListHeading(POST_LIST_TITLE, posts.length);

  return listPage(ctx, head, { heading, lead: POST_LIST_LEAD, list: postList(posts) }, posts);
}

/** 月別の一覧ページ。見た目はトップと同じ部品。posts はサイドバーの部品に使う公開済みの全記事（新しい順） */
export function archivePage(archive: MonthArchive, posts: readonly PostContent[], ctx: PageContext): string {
  const title = archiveTitle(archive.month);
  const description = archiveDescription(archive.month);
  const head = { title, description, path: archivePath(archive.month) };
  const heading = postListHeading(title, archive.posts.length);

  return listPage(ctx, head, { heading, lead: description, list: postList(archive.posts) }, posts);
}

/** タグの一覧ページ（/tags/）。タグと記事の件数を、記事の多い順に並べる。posts はサイドバーの部品に使う公開済みの全記事（新しい順） */
export function tagIndexPage(posts: readonly PostContent[], ctx: PageContext): string {
  const tags = groupPostsByTag(posts);
  const head = { title: TAGS_TITLE, description: TAG_INDEX_DESCRIPTION, path: TAG_INDEX_PATH };
  const heading = postListHeading(TAGS_TITLE, tags.length, "個");
  const list = tags.length === 0 ? `<p${cls("PostList", "empty")}>${escapeHtml(TAG_INDEX_EMPTY_TEXT)}</p>` : tagIndexList(tags);

  return listPage(ctx, head, { heading, lead: TAG_INDEX_DESCRIPTION, list }, posts);
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
  const head = { title, description, path: tagPath(archive.tag) };
  const heading = postListHeading(title, archive.posts.length);

  return listPage(ctx, head, { heading, lead: description, list: postList(archive.posts) }, posts);
}

/** 一覧のページの中身。heading は postListHeading、lead は説明文（エスケープ前）、list は一覧の HTML */
type ListPageBody = { heading: string; lead: string; list: string };

/** 一覧のページ（トップ、月別、タグの一覧、タグごと）。見出し・説明文・一覧を、右にサイドバーを置いた 2 列で包む */
function listPage(ctx: PageContext, head: HeadOptions, { heading, lead, list }: ListPageBody, posts: readonly PostContent[]): string {
  // 説明文は見出しと一覧のあいだの余白も兼ねる（PostList の .lead の margin）
  return page(ctx, head, withSidebar(`${heading}${postListLead(lead)}${list}`, posts));
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
  const cardClass = classList(["PostList", "card"], ["PostList", "post"]);
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
 * サイドバーはプロフィールだけにする（postSidebar）。
 * 本文の後ろに、前後の記事と関連する記事を出す。posts は公開済みの全記事（新しい順）
 */
export function postPage(post: PostContent, posts: readonly PostContent[], ctx: PageContext): string {
  const isMarp = isMarpMarkdown(post.bodyMarkdown);
  const { html, headings } = isMarp ? { html: "", headings: [] } : renderMarkdownWithHeadings(post.bodyMarkdown);
  const hasToc = headings.length > 0;

  const aside = hasToc ? `<aside${cls("PostDetail", "aside")}>${tableOfContents(headings)}</aside>` : "";
  const column = `<div${cls("Sidebar", "column")}>${postSidebar()}${aside}</div>`;
  const body = isMarp ? marpDeck(post.bodyMarkdown, ctx.assets.marpScript) : `<div${cls("PostDetail", "body")}>${html}</div>`;
  const backLabel = `${POST_LIST_TITLE}へ戻る`;
  const footer = `<footer${cls("PostDetail", "footer")}><p><a${cls("PostDetail", "back")} href="${HOME_PATH}">← ${escapeHtml(backLabel)}</a></p></footer>`;
  const main = `<article${cls("Sidebar", "postLayout")}>${postHeader(post, { href: HOME_PATH, label: POST_LIST_TITLE }, tagChips(post.tags))}${column}<div${cls("PostDetail", "content")}>${body}${neighborPosts(post, posts)}${relatedPosts(post, posts)}${footer}</div></article>`;

  const article = { publishedTime: post.publishedAt, updatedTime: post.updatedAt };
  const image = { path: ogImagePath(post.slug), alt: post.title };

  return page(ctx, { title: post.title, description: post.summary, path: postPath(post.slug), article, image }, main);
}

/** 前の記事（1 つ古い）と次の記事（1 つ新しい）へのリンク。どちらも無ければ出さない */
function neighborPosts(post: PostContent, posts: readonly PostContent[]): string {
  // posts は新しい順なので、1 つ後ろが前の記事、1 つ前が次の記事
  const index = posts.indexOf(post);
  const previous = neighborLink(posts[index + 1], "前の記事", "prev");
  const next = neighborLink(posts[index - 1], "次の記事", "next");
  if (previous === "" && next === "") return "";

  return `<nav${cls("PostExtras", "neighbors")} aria-label="前後の記事">${previous}${next}</nav>`;
}

function neighborLink(post: PostContent | undefined, label: string, rel: "prev" | "next"): string {
  if (post === undefined) return "";

  const linkClass = rel === "next" ? classList(["PostExtras", "neighbor"], ["PostExtras", "next"]) : classOf("PostExtras", "neighbor");

  return `<a${attr("class", linkClass)} rel="${rel}" href="${escapeHtml(postPath(post.slug))}"><span${cls("PostExtras", "label")}>${label}</span>${escapeHtml(post.title)}</a>`;
}

/** 同じタグを持つ記事の一覧。該当が無ければ出さない */
function relatedPosts(post: PostContent, posts: readonly PostContent[]): string {
  const related = relatedPostsOf(post, posts, RELATED_POSTS_COUNT);
  if (related.length === 0) return "";

  const items = related.map(
    (other) =>
      `<li><a href="${escapeHtml(postPath(other.slug))}">${escapeHtml(other.title)}</a><time datetime="${escapeHtml(other.publishedAt)}">${formatDate(other.publishedAt)}</time></li>`,
  );
  const heading = `<h2 id="related-heading"${cls("PostExtras", "relatedHeading")}>関連する記事</h2>`;

  return `<section${cls("PostExtras", "related")} aria-labelledby="related-heading">${heading}<ul${cls("PostExtras", "relatedList")}>${items.join("")}</ul></section>`;
}

/** 404（GitHub Pages は 404.html を返す） */
export function notFoundPage(ctx: PageContext): string {
  const message = `<h1>ページが見つかりません</h1><p>お探しのページは移動または削除された可能性があります。</p>`;
  const back = `<p><a href="${HOME_PATH}">${escapeHtml(POST_LIST_TITLE)}へ戻る</a></p>`;

  return page(ctx, { title: "ページが見つかりません", description: SITE_DESCRIPTION, noindex: true }, `${message}${back}`);
}

/**
 * プライバシーポリシー。書いてある内容は実装に合わせてある。
 * - 送るもの：vendor/goatcounter/count.js の get_data（パスとクエリ、タイトル、参照元、画面の幅、自動操作のブラウザかどうか）
 * - 送り先：src/site.ts の GOATCOUNTER_ENDPOINT と、CSP の connect-src
 * - GoatCounter が保存するもの：https://www.goatcounter.com/help/privacy と https://www.goatcounter.com/help/sessions（2026-10-29 に確認）。
 *   GoatCounter の設定（Settings → Data collection）は、Individual pageviews・Region・Language を無効にしている（2026-10-29）
 * 送るもの・送り先・GoatCounter の設定を変えたら、このページも更新する
 */
export function privacyPage(ctx: PageContext): string {
  const goatcounterPrivacy = `<a href="https://www.goatcounter.com/help/privacy" rel="noopener noreferrer">GoatCounter のプライバシーポリシー</a>`;
  const main = [
    `<h1>${escapeHtml(PRIVACY_TITLE)}</h1>`,
    `<p>このサイトはアクセス数を数えるために、アクセス解析のサービスの GoatCounter を使っている。閲覧者の情報を集めるのはこれだけで、コメントや問い合わせのフォームなど、入力してもらうものは無い。</p>`,
    `<h2>送るもの</h2>`,
    `<p>ページを開くと、ブラウザから GoatCounter に次を送る。</p>`,
    `<ul><li>見たページのパスと、URL のクエリ（? から後ろ）</li><li>ページのタイトル</li><li>参照元（このページへのリンクがあったページの URL）</li><li>画面の幅</li><li>自動操作のブラウザかどうかの判定</li></ul>`,
    `<p>通信の仕組み上、GoatCounter には IP アドレスとブラウザの種類（User-Agent）も届く。自分の PC（localhost）で開いたときと、ほかのサイトの枠（iframe）の中で開いたときは送らない。</p>`,
    `<h2>GoatCounter が保存するもの</h2>`,
    `<p>保存するのは日ごと・時間ごとの集計で、ページごとの閲覧数、参照元、ブラウザの名前とバージョン、OS、IP アドレスから推定した国、画面の幅。IP アドレスと User-Agent そのものは保存しない。訪れた人の数を数える（同じ人の閲覧かどうかを見分ける）ために、IP アドレスと User-Agent の組をメモリに最長 8 時間置くが、データベースには書かない。1 回ごとの閲覧の記録は取らない設定にしている。</p>`,
    `<p>データは GoatCounter のサーバー（フィンランドとドイツ）に置かれる。詳しくは ${goatcounterPrivacy} にある。</p>`,
    `<h2>Cookie とブラウザに保存するもの</h2>`,
    `<p>Cookie は使わない。GoatCounter のスクリプトは、ブラウザの localStorage の skipgc（作者が自分の閲覧を数えないための設定）を読む。書き込むのは、URL の末尾に #toggle-goatcounter を付けて開いたときだけ。</p>`,
    `<h2>変更</h2>`,
    `<p>この内容を変えるときは、このページを更新する。最終更新日：<time datetime="2026-10-29">2026-10-29</time></p>`,
  ].join("");

  return page(ctx, { title: PRIVACY_TITLE, description: "このサイトが集める情報と、アクセス解析（GoatCounter）に送るもの", path: PRIVACY_PATH }, main);
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

/**
 * ページ全体。head.path はナビの現在地（aria-current）の判定にも使う。
 * どのページも GoatCounter の count.js を読み、開いたときに 1 回数える（送るものは /privacy/ に書いた）
 */
function page({ assets, now }: PageContext, head: HeadOptions, main: string): string {
  const counter = `<script data-goatcounter="${escapeHtml(GOATCOUNTER_ENDPOINT)}" src="${assets.counterScript}" async></script>`;
  const body = `${siteHeader(NAV_ITEMS, head.path)}<main${cls("layout", "main")}>${main}</main>${siteFooter(now)}<script src="${assets.script}" defer></script>${counter}`;

  return `<!DOCTYPE html><html lang="ja"><head>${headTags(head, assets)}</head><body>${body}</body></html>\n`;
}

function headTags({ title, description, path, article, image = OG_IMAGE, noindex }: HeadOptions, assets: Assets): string {
  // <title> と og:title はどちらも「タイトル | サイト名」。タイトルが無いページ（トップ）はサイト名だけ
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  // og:title は、ページのメタデータを持つページ（トップ、月別とタグの一覧、記事）だけがタイトル入り。404 はサイト名（Next.js 版と同じ）
  const ogTitle = path !== undefined ? fullTitle : SITE_NAME;
  const url = path !== undefined ? absoluteUrl(path) : undefined;
  const imageUrl = absoluteUrl(image.path);
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
    og("og:image", imageUrl),
    og("og:image:width", imageWidth),
    og("og:image:height", imageHeight),
    og("og:image:alt", image.alt),
    og("og:type", article ? "article" : "website"),
    og("article:published_time", article?.publishedTime),
    og("article:modified_time", modifiedTime(article)),
    meta({ name: "twitter:card", content: "summary_large_image" }),
    meta({ name: "twitter:title", content: ogTitle }),
    meta({ name: "twitter:description", content: description }),
    meta({ name: "twitter:image", content: imageUrl }),
    meta({ name: "twitter:image:alt", content: image.alt }),
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

  return isUpdatedAfterPublished(article.publishedTime, article.updatedTime) ? article.updatedTime : undefined;
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

/**
 * フッター。著作権の表示の年は日本時間で数える。ビルド環境（CI は UTC）の時差の影響を避けるため。
 */
function siteFooter(now: Date): string {
  const year = formatYear(now);
  const links = FOOTER_LINKS.map(
    (link) => `<span> ・ <a href="${escapeHtml(link.href)}" rel="noopener noreferrer">${escapeHtml(link.label)}</a></span>`,
  );

  return `<footer${cls("SiteFooter", "footer")}><p${cls("SiteFooter", "inner")}>© ${year} ${escapeHtml(AUTHOR_NAME)}${links.join("")}</p></footer>`;
}
