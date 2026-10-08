import type { MetadataRoute } from "next";
// node --test から読み込めるよう、拡張子付きで import する
import { HOME_PATH, postPath } from "./paths.ts";
import type { PostContent } from "./post-types.ts";

/** sitemap.xml の中身。トップページと、渡した記事（サイトに出す記事）のページ */
export function buildSitemap(posts: readonly PostContent[], baseUrl: URL): MetadataRoute.Sitemap {
  const entries = posts.map((post) => ({
    url: new URL(postPath(post.slug), baseUrl).toString(),
    lastModified: post.updatedAt,
  }));
  return [
    // 記事が無ければ、更新日時が分からないので lastModified は省く
    { url: new URL(HOME_PATH, baseUrl).toString(), ...(entries.length > 0 && { lastModified: latest(entries) }) },
    ...entries,
  ];
}

/** 記事の最終更新日時のうち、いちばん新しいもの（1 件以上あるときだけ呼ぶ） */
function latest(entries: { lastModified: string }[]): string {
  return entries
    .map(({ lastModified }) => lastModified)
    .reduce((max, value) => (Date.parse(value) > Date.parse(max) ? value : max));
}
