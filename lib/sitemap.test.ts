import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { PostContent } from "./post-types.ts";
import { buildSitemap } from "./sitemap.ts";

const baseUrl = new URL("https://example.com");

function post(slug: string, publishedAt: string, updatedAt = publishedAt): PostContent {
  return { slug, title: "t", summary: "s", bodyMarkdown: "", publishedAt, updatedAt };
}

describe("buildSitemap", () => {
  test("記事が 0 件ならトップページだけで、lastModified は付けない", () => {
    assert.deepEqual(buildSitemap([], baseUrl), [{ url: "https://example.com/" }]);
  });

  test("記事のページの lastModified は updatedAt。トップページはそのうち最新", () => {
    const sitemap = buildSitemap(
      [
        post("new-post", "2026-10-01T00:00:00.000Z"),
        // 公開は古いが、後から更新した記事
        post("old-post", "2026-09-01T00:00:00.000Z", "2026-10-05T00:00:00.000Z"),
      ],
      baseUrl,
    );
    assert.deepEqual(sitemap, [
      { url: "https://example.com/", lastModified: "2026-10-05T00:00:00.000Z" },
      { url: "https://example.com/posts/new-post/", lastModified: "2026-10-01T00:00:00.000Z" },
      { url: "https://example.com/posts/old-post/", lastModified: "2026-10-05T00:00:00.000Z" },
    ]);
  });
});
