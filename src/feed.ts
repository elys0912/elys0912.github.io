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
  const latest = [...posts]
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, FEED_ENTRY_LIMIT)
    .map((post) => ({ post, url: absoluteUrl(postPath(post.slug)), updated: entryUpdated(post) }));

  const feedUpdated = latest.reduce(
    (max, { updated }) => (updated > max ? updated : max),
    latest.length > 0 ? latest[0].updated : now.toISOString(),
  );

  const lines = [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ja">`,
    `  <id>${escapeXml(siteUrl)}</id>`,
    `  <title>${escapeXml(SITE_NAME)}</title>`,
    `  <subtitle>${escapeXml(SITE_DESCRIPTION)}</subtitle>`,
    `  <updated>${feedUpdated}</updated>`,
    `  <link rel="self" type="application/atom+xml" href="${escapeXml(absoluteUrl(FEED_PATH))}"/>`,
    `  <link rel="alternate" type="text/html" href="${escapeXml(siteUrl)}"/>`,
    `  <author><name>${escapeXml(AUTHOR_NAME)}</name></author>`,
    ...latest.flatMap(({ post, url, updated }) => [
      `  <entry>`,
      `    <id>${escapeXml(url)}</id>`,
      `    <title>${escapeXml(post.title)}</title>`,
      `    <link rel="alternate" type="text/html" href="${escapeXml(url)}"/>`,
      `    <published>${toRfc3339(post.publishedAt)}</published>`,
      `    <updated>${updated}</updated>`,
      `    <summary>${escapeXml(post.summary)}</summary>`,
      `  </entry>`,
    ]),
    `</feed>`,
  ];
  return `${lines.join("\n")}\n`;
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
  const urls = [home, ...entries].map(({ url, lastModified }) =>
    [
      "<url>",
      `<loc>${escapeXml(url)}</loc>`,
      ...(lastModified !== undefined ? [`<lastmod>${escapeXml(lastModified)}</lastmod>`] : []),
      "</url>",
    ].join("\n"),
  );
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

// XML 1.0 で使えない制御文字（タブ、改行、復帰以外の C0 制御文字など）。残すと XML として壊れる
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
