// サイト内のパス。リンクはすべてここから作る（basePath は無いので、ドメインの直下からのパス）

/** 記事一覧（トップページ） */
export const HOME_PATH = "/";

/** Atom フィード（app/feed.xml/route.ts） */
export const FEED_PATH = "/feed.xml";

/** 記事の詳細ページ（/posts/<slug>/） */
export function postPath(slug: string): string {
  return `/posts/${encodeURIComponent(slug)}/`;
}
