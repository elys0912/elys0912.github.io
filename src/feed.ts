// /feed.xml（Atom 1.0）、/sitemap.xml、/robots.txt の中身を組み立てる。
// 依存を増やさないよう XML は文字列で組み立てる。値はすべて escapeXml を通す。

import type { PostContent } from "../shared/lib/post-types.ts";
import {
  absoluteUrl,
  AUTHOR_NAME,
  FEED_PATH,
  HOME_PATH,
  postPath,
  SITE_DESCRIPTION,
  SITE_NAME,
} from "./site.ts";

/** フィードに載せる記事の数 */
export const FEED_ENTRY_LIMIT = 20;

/**
 * 記事（サイトに出すもの）から Atom 1.0 の XML を返す。公開日時の新しい順に FEED_ENTRY_LIMIT 件まで載せる。
 * 記事が 0 件のときは、フィードの updated に now を使う
 */
export function buildAtomFeed(posts: readonly PostContent[], now: Date): string {
  const siteUrl = absoluteUrl(HOME_PATH);
  const latestPosts = [...posts]
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, FEED_ENTRY_LIMIT);
  const updatedTimes = latestPosts.map(entryUpdated);
  const feedUpdated = updatedTimes.reduce((max, updated) => (updated > max ? updated : max), updatedTimes[0] ?? now.toISOString());

  const lines = [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ja">`,
    `  ${element("id", siteUrl)}`,
    `  ${element("title", SITE_NAME)}`,
    `  ${element("subtitle", SITE_DESCRIPTION)}`,
    `  ${element("updated", feedUpdated)}`,
    `  ${link({ rel: "self", type: "application/atom+xml", href: absoluteUrl(FEED_PATH) })}`,
    `  ${link({ rel: "alternate", type: "text/html", href: siteUrl })}`,
    `  <author>${element("name", AUTHOR_NAME)}</author>`,
    ...latestPosts.flatMap(entryLines),
    `</feed>`,
  ];

  return `${lines.join("\n")}\n`;
}

/** フィードの 1 記事分の行 */
function entryLines(post: PostContent): string[] {
  const url = absoluteUrl(postPath(post.slug));

  return [
    `  <entry>`,
    `    ${element("id", url)}`,
    `    ${element("title", post.title)}`,
    `    ${link({ rel: "alternate", type: "text/html", href: url })}`,
    `    ${element("published", toRfc3339(post.publishedAt))}`,
    `    ${element("updated", entryUpdated(post))}`,
    `    ${element("summary", post.summary)}`,
    `  </entry>`,
  ];
}

/** entry の updated。公開後に更新したときだけ updatedAt を使う */
function entryUpdated({ publishedAt, updatedAt }: PostContent): string {
  return toRfc3339(Date.parse(updatedAt) > Date.parse(publishedAt) ? updatedAt : publishedAt);
}

/** UTC の RFC 3339（例：2026-10-01T00:00:00.000Z）にそろえる。読めない日時はビルドを止める */
function toRfc3339(value: string): string {
  return new Date(value).toISOString();
}

/** sitemap.xml。トップページ（記事があれば最新の更新日時を付ける）と、記事のページ */
export function buildSitemap(posts: readonly PostContent[]): string {
  const entries = posts.map((post) => ({ url: absoluteUrl(postPath(post.slug)), lastModified: post.updatedAt }));
  const home = { url: absoluteUrl(HOME_PATH), lastModified: latest(entries.map((entry) => entry.lastModified)) };
  const urls = [home, ...entries].map(({ url, lastModified }) => {
    const lastmod = lastModified === undefined ? [] : [element("lastmod", lastModified)];

    return ["<url>", element("loc", url), ...lastmod, "</url>"].join("\n");
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
    "",
  ].join("\n");
}

/** いちばん新しい日時。空なら undefined（記事が無ければ、トップページの lastmod は省く） */
function latest(values: string[]): string | undefined {
  return values.reduce<string | undefined>(
    (max, value) => (max === undefined || Date.parse(value) > Date.parse(max) ? value : max),
    undefined,
  );
}

/** robots.txt。すべて許可し、sitemap.xml を案内する */
export function buildRobots(): string {
  return `User-Agent: *\nAllow: /\n\nSitemap: ${absoluteUrl("/sitemap.xml")}\n`;
}

/** <name>text</name> */
function element(name: string, text: string): string {
  return `<${name}>${escapeXml(text)}</${name}>`;
}

/** <link …/> */
function link(attrs: Record<string, string>): string {
  const attrList = Object.entries(attrs).map(([name, value]) => ` ${name}="${escapeXml(value)}"`);

  return `<link${attrList.join("")}/>`;
}

// XML 1.0 で使えない制御文字（タブ、改行、復帰以外の C0 制御文字など）。残すと XML として不正になる
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

const xmlEntities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/** テキストと属性値に入れられるよう、& < > " ' を実体参照にする。XML で使えない制御文字は取り除く */
export function escapeXml(value: string): string {
  return value.replace(INVALID_XML_CHARS, "").replace(/[&<>"']/g, (char) => xmlEntities[char]);
}
