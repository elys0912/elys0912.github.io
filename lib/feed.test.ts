import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildAtomFeed, escapeXml, FEED_ENTRY_LIMIT, type AtomFeedOptions, type FeedEntry } from "./feed.ts";

const base: Omit<AtomFeedOptions, "entries"> = {
  title: "サイト名",
  subtitle: "説明",
  siteUrl: "https://example.com/",
  feedUrl: "https://example.com/feed.xml",
  authorName: "著者",
  now: new Date("2026-10-07T00:00:00Z"),
};

function entry(overrides: Partial<FeedEntry> & Pick<FeedEntry, "publishedAt">): FeedEntry {
  return {
    title: "記事",
    url: "https://example.com/posts/a/",
    summary: "概要",
    ...overrides,
  };
}

function entryBlocks(xml: string): string[] {
  return xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
}

function entryTitles(xml: string): (string | undefined)[] {
  return entryBlocks(xml).map((block) => /<title>(.*)<\/title>/.exec(block)?.[1]);
}

describe("escapeXml", () => {
  test("& < > \" ' を実体参照にする", () => {
    assert.equal(escapeXml(`a & b <c> "d" 'e'`), "a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;");
  });

  test("実体参照に見える文字列も二重にエスケープして文字どおりに出す", () => {
    assert.equal(escapeXml("&amp;"), "&amp;amp;");
  });

  test("XML で使えない制御文字は取り除き、タブと改行は残す", () => {
    assert.equal(escapeXml("a\u0000b\u0008c\u000Bd\te\nf\rg"), "abcd\te\nf\rg");
  });
});

describe("buildAtomFeed", () => {
  test("title と summary をエスケープする", () => {
    const xml = buildAtomFeed({
      ...base,
      entries: [entry({ title: "<b>A & B</b>", summary: `"引用" と 'x'`, publishedAt: "2026-09-01T00:00:00Z" })],
    });
    assert.match(xml, /<title>&lt;b&gt;A &amp; B&lt;\/b&gt;<\/title>/);
    assert.match(xml, /<summary>&quot;引用&quot; と &apos;x&apos;<\/summary>/);
    assert.doesNotMatch(xml, /<b>/);
  });

  test("entry に link、id、published、updated、summary を入れ、本文は入れない", () => {
    const xml = buildAtomFeed({
      ...base,
      entries: [entry({ url: "https://example.com/posts/x/", publishedAt: "2026-09-01T09:00:00+09:00" })],
    });
    const blocks = entryBlocks(xml);
    assert.equal(blocks.length, 1);
    const [block] = blocks;
    assert.match(block, /<id>https:\/\/example\.com\/posts\/x\/<\/id>/);
    assert.match(block, /<link rel="alternate" type="text\/html" href="https:\/\/example\.com\/posts\/x\/"\/>/);
    assert.match(block, /<published>2026-09-01T00:00:00\.000Z<\/published>/);
    assert.match(block, /<summary>概要<\/summary>/);
    assert.doesNotMatch(block, /<content/);
  });

  test("記事が 0 件なら entry の無いフィードを出し、updated は now を使う", () => {
    const xml = buildAtomFeed({ ...base, entries: [] });
    assert.equal(entryBlocks(xml).length, 0);
    assert.match(xml, /^<\?xml version="1\.0" encoding="utf-8"\?>\n<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom"/);
    assert.match(xml, /<id>https:\/\/example\.com\/<\/id>/);
    assert.match(xml, /<updated>2026-10-07T00:00:00\.000Z<\/updated>/);
    assert.match(xml, /<link rel="self" type="application\/atom\+xml" href="https:\/\/example\.com\/feed\.xml"\/>/);
    assert.match(xml, /<\/feed>\n$/);
  });

  test("公開日時の新しい順に並べる", () => {
    const xml = buildAtomFeed({
      ...base,
      entries: [
        entry({ title: "中", publishedAt: "2026-09-15T00:00:00Z" }),
        entry({ title: "古", publishedAt: "2026-09-01T00:00:00Z" }),
        // オフセットが違っても時刻で比べる（UTC で 2026-09-19T15:00:00Z）
        entry({ title: "新", publishedAt: "2026-09-20T00:00:00+09:00" }),
      ],
    });
    assert.deepEqual(entryTitles(xml), ["新", "中", "古"]);
  });

  test(`${FEED_ENTRY_LIMIT} 件を超えたら新しいものから ${FEED_ENTRY_LIMIT} 件だけ載せる`, () => {
    const entries = Array.from({ length: FEED_ENTRY_LIMIT + 5 }, (_, i) =>
      entry({ title: `記事${i}`, publishedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() }),
    );
    const titles = entryTitles(buildAtomFeed({ ...base, entries }));
    assert.equal(titles.length, FEED_ENTRY_LIMIT);
    assert.equal(titles[0], `記事${FEED_ENTRY_LIMIT + 4}`);
    assert.equal(titles.at(-1), "記事5");
  });

  test("entry の updated は、updatedAt が無いか公開日時以前なら publishedAt を使う", () => {
    const cases: [string | undefined, string][] = [
      [undefined, "2026-09-01T00:00:00.000Z"],
      // 更新日時が公開日時より前
      ["2026-08-20T00:00:00Z", "2026-09-01T00:00:00.000Z"],
      ["2026-09-01T00:00:00Z", "2026-09-01T00:00:00.000Z"],
      ["2026-09-15T00:00:00Z", "2026-09-15T00:00:00.000Z"],
    ];
    for (const [updatedAt, expected] of cases) {
      const xml = buildAtomFeed({ ...base, entries: [entry({ publishedAt: "2026-09-01T00:00:00Z", updatedAt })] });
      const [block] = entryBlocks(xml);
      assert.ok(block.includes(`<updated>${expected}</updated>`), String(updatedAt));
    }
  });

  test("フィードの updated は載せた記事の updated のうち最新", () => {
    const xml = buildAtomFeed({
      ...base,
      entries: [
        entry({ publishedAt: "2026-09-20T00:00:00Z" }),
        // 公開は古いが、後から更新した記事
        entry({ publishedAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-25T00:00:00Z" }),
      ],
    });
    const feedHead = xml.slice(0, xml.indexOf("<entry>"));
    assert.ok(feedHead.includes("<updated>2026-09-25T00:00:00.000Z</updated>"));
  });

  test("読めない日時があれば例外を投げる（壊れたフィードを出力しない）", () => {
    assert.throws(() => buildAtomFeed({ ...base, entries: [entry({ publishedAt: "日時ではない" })] }), RangeError);
  });
});
