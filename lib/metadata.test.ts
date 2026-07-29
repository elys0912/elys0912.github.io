import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildPageMetadata } from "./metadata.ts";
import { SITE_NAME } from "./site.ts";

const siteUrl = new URL("https://example.com");

describe("buildPageMetadata", () => {
  test("canonical と og:url に絶対 URL を入れ、フィードの alternate も入れる", () => {
    const metadata = buildPageMetadata({ title: "記事", description: "説明", path: "/posts/a/" }, siteUrl);
    assert.deepEqual(metadata.alternates, {
      canonical: "https://example.com/posts/a/",
      types: { "application/atom+xml": [{ url: "https://example.com/feed.xml", title: SITE_NAME }] },
    });
    assert.equal(metadata.openGraph?.url, "https://example.com/posts/a/");
  });

  test("タイトルにサイト名を付け、省略時はサイト名だけにする", () => {
    const page = buildPageMetadata({ title: "記事", description: "説明", path: "/posts/a/" }, siteUrl);
    assert.equal(page.title, "記事");
    assert.equal(page.openGraph?.title, `記事 | ${SITE_NAME}`);
    assert.equal(page.twitter?.title, `記事 | ${SITE_NAME}`);

    const top = buildPageMetadata({ description: "説明", path: "/" }, siteUrl);
    assert.equal("title" in top, false);
    assert.equal(top.openGraph?.title, SITE_NAME);
  });

  test("詳細ページは article。公開後に更新したときだけ modified_time を入れる", () => {
    const updated = buildPageMetadata(
      {
        title: "記事",
        description: "説明",
        path: "/posts/a/",
        article: { publishedTime: "2026-09-01T00:00:00Z", updatedTime: "2026-09-15T00:00:00Z" },
      },
      siteUrl,
    );
    assert.deepEqual(
      {
        type: (updated.openGraph as { type?: string }).type,
        publishedTime: (updated.openGraph as { publishedTime?: string }).publishedTime,
        modifiedTime: (updated.openGraph as { modifiedTime?: string }).modifiedTime,
      },
      { type: "article", publishedTime: "2026-09-01T00:00:00Z", modifiedTime: "2026-09-15T00:00:00Z" },
    );

    // 更新なし（同時刻）と、更新日時が公開日時より前のときは入れない
    for (const updatedTime of ["2026-09-01T00:00:00Z", "2026-08-20T00:00:00Z"]) {
      const metadata = buildPageMetadata(
        { title: "記事", description: "説明", path: "/posts/a/", article: { publishedTime: "2026-09-01T00:00:00Z", updatedTime } },
        siteUrl,
      );
      assert.equal(metadata.openGraph && "modifiedTime" in metadata.openGraph, false, updatedTime);
    }
  });

  test("og:image と twitter:image にサイト共通の画像を絶対 URL で入れる", () => {
    const expected = [{ url: "https://example.com/opengraph-image.png", width: 1200, height: 630, alt: SITE_NAME }];
    const page = buildPageMetadata({ title: "記事", description: "説明", path: "/posts/a/" }, siteUrl);
    assert.deepEqual(page.openGraph?.images, expected);
    assert.deepEqual(page.twitter?.images, expected);
    assert.equal((page.twitter as { card?: string }).card, "summary_large_image");
  });

  test("path を省略すると（layout の既定値）canonical と og:url は出さず、フィードの alternate と画像は入れる", () => {
    const metadata = buildPageMetadata({ description: "説明" }, siteUrl);
    assert.deepEqual(metadata.alternates, {
      types: { "application/atom+xml": [{ url: "https://example.com/feed.xml", title: SITE_NAME }] },
    });
    assert.equal(metadata.openGraph && "url" in metadata.openGraph, false);
    assert.equal(Array.isArray(metadata.openGraph?.images), true);
  });

  test("詳細以外のページは website", () => {
    const metadata = buildPageMetadata({ description: "説明", path: "/" }, siteUrl);
    assert.equal((metadata.openGraph as { type?: string }).type, "website");
  });
});
