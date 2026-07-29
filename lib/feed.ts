// Atom 1.0 のフィード（/feed.xml）を組み立てる。app/feed.xml/route.ts から使う。
// 依存を増やさないよう XML は文字列で組み立てる。値はすべて escapeXml を通す。

/** フィードに載せる記事の数 */
export const FEED_ENTRY_LIMIT = 20;

export type FeedEntry = {
  title: string;
  /** 記事ページの絶対 URL。entry の link と id に使う */
  url: string;
  summary: string;
  publishedAt: string;
  /** 省略時や公開日時以前のときは publishedAt を使う */
  updatedAt?: string;
};

export type AtomFeedOptions = {
  title: string;
  subtitle: string;
  /** サイトのトップの絶対 URL。フィードの id と alternate の link に使う */
  siteUrl: string;
  /** このフィード自身の絶対 URL（rel="self"） */
  feedUrl: string;
  authorName: string;
  entries: FeedEntry[];
  /** 記事が 0 件のときのフィードの updated。記事があれば最新の記事の updated を使う */
  now: Date;
};

/** 記事の一覧から Atom 1.0 の XML を返す。公開日時の新しい順に FEED_ENTRY_LIMIT 件まで載せる。 */
export function buildAtomFeed({
  title,
  subtitle,
  siteUrl,
  feedUrl,
  authorName,
  entries,
  now,
}: AtomFeedOptions): string {
  const latest = [...entries]
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, FEED_ENTRY_LIMIT)
    .map((entry) => ({ ...entry, updated: entryUpdated(entry) }));

  const feedUpdated = latest.reduce(
    (max, { updated }) => (updated > max ? updated : max),
    latest.length > 0 ? latest[0].updated : now.toISOString(),
  );

  const lines = [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ja">`,
    `  <id>${escapeXml(siteUrl)}</id>`,
    `  <title>${escapeXml(title)}</title>`,
    `  <subtitle>${escapeXml(subtitle)}</subtitle>`,
    `  <updated>${feedUpdated}</updated>`,
    `  <link rel="self" type="application/atom+xml" href="${escapeXml(feedUrl)}"/>`,
    `  <link rel="alternate" type="text/html" href="${escapeXml(siteUrl)}"/>`,
    `  <author><name>${escapeXml(authorName)}</name></author>`,
    ...latest.flatMap((entry) => [
      `  <entry>`,
      `    <id>${escapeXml(entry.url)}</id>`,
      `    <title>${escapeXml(entry.title)}</title>`,
      `    <link rel="alternate" type="text/html" href="${escapeXml(entry.url)}"/>`,
      `    <published>${toRfc3339(entry.publishedAt)}</published>`,
      `    <updated>${entry.updated}</updated>`,
      `    <summary>${escapeXml(entry.summary)}</summary>`,
      `  </entry>`,
    ]),
    `</feed>`,
  ];
  return `${lines.join("\n")}\n`;
}

/** entry の updated。公開後に更新したときだけ updatedAt を使う */
function entryUpdated({ publishedAt, updatedAt }: FeedEntry): string {
  if (updatedAt !== undefined && Date.parse(updatedAt) > Date.parse(publishedAt)) {
    return toRfc3339(updatedAt);
  }
  return toRfc3339(publishedAt);
}

/** UTC の RFC 3339（例：2026-10-01T00:00:00.000Z）にそろえる。読めない日時はビルドを止める */
function toRfc3339(value: string): string {
  return new Date(value).toISOString();
}

// XML 1.0 で使えない制御文字（タブ、改行、復帰以外の C0 制御文字など）。残すと XML として壊れる
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

/** テキストと属性値に入れられるよう、& < > " ' を実体参照にする。XML で使えない制御文字は取り除く */
export function escapeXml(value: string): string {
  return value.replace(INVALID_XML_CHARS, "").replace(/[&<>"']/g, (char) => xmlEntities[char]);
}

const xmlEntities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};
