import { buildAtomFeed } from "@/lib/feed";
import { FEED_PATH, HOME_PATH, postPath } from "@/lib/paths";
import { listPublishedPosts } from "@/lib/posts";
import { AUTHOR_NAME, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

// 静的出力では force-static が必須（無いとビルドが失敗する）
export const dynamic = "force-static";

export function GET(): Response {
  const xml = buildAtomFeed({
    title: SITE_NAME,
    subtitle: SITE_DESCRIPTION,
    siteUrl: new URL(HOME_PATH, SITE_URL).toString(),
    feedUrl: new URL(FEED_PATH, SITE_URL).toString(),
    authorName: AUTHOR_NAME,
    entries: listPublishedPosts().map((post) => ({
      title: post.title,
      url: new URL(postPath(post.slug), SITE_URL).toString(),
      summary: post.summary,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
    })),
    now: new Date(),
  });
  return new Response(xml, { headers: { "Content-Type": "application/atom+xml; charset=utf-8" } });
}
