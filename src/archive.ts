// 月別のまとめ。記事を、公開日時を日本時間で数えた年月ごとに分ける。
// 年月は一覧の日付の表示（shared/lib/format.ts の formatDate）から取る。表示の日付と月がずれないため。

import { formatDate } from "../shared/lib/format.ts";
import type { PostContent } from "../shared/lib/post-types.ts";

/** 1 か月分の記事。month は「2026-10」（yyyy-MM） */
export type MonthArchive = { month: string; posts: PostContent[] };

/** 記事を公開した年月ごとに分ける。年月は新しい順。各月の記事は渡した順のまま */
export function groupPostsByMonth(posts: readonly PostContent[]): MonthArchive[] {
  const postsByMonth = Map.groupBy(posts, publishedMonth);

  return [...postsByMonth]
    .map(([month, monthPosts]) => ({ month, posts: monthPosts }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

/** 公開した年月（yyyy-MM、日本時間） */
function publishedMonth(post: PostContent): string {
  return formatDate(post.publishedAt).slice(0, "yyyy-MM".length);
}
