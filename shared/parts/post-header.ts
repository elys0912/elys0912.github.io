// 記事の詳細の冒頭（パンくずリスト、公開日と更新日、タイトル、要約）。
// 2 つのサイトで違うもの（パンくずの先頭、要約の後ろに足すもの）は引数で受ける。lib/site.ts・lib/paths.ts は読まない（ブログと共有するため）。

import { cls } from "../lib/css.ts";
import { formatDate } from "../lib/format.ts";
import { escapeHtml } from "../lib/html.ts";
import type { PostContent } from "../lib/post-types.ts";

/** パンくずの先頭（一覧のページ）へのリンク */
export type BreadcrumbRoot = { href: string; label: string };

/** afterSummaryHtml は、要約の後ろに足す HTML（主ボタン、タグなど。無ければ空の文字列） */
export function postHeader(post: PostContent, root: BreadcrumbRoot, afterSummaryHtml: string): string {
  const breadcrumb = `<nav aria-label="パンくずリスト"><ol${cls("PostDetail", "breadcrumb")}><li><a href="${escapeHtml(root.href)}">${escapeHtml(root.label)}</a></li><li aria-current="page">${escapeHtml(post.title)}</li></ol></nav>`;
  const title = `<h1${cls("PostDetail", "title")}>${escapeHtml(post.title)}</h1>`;
  const summary = `<p${cls("PostDetail", "summary")}>${escapeHtml(post.summary)}</p>`;

  return `<header${cls("PostDetail", "header")}>${breadcrumb}${postDates(post)}${title}${summary}${afterSummaryHtml}</header>`;
}

function postDates(post: PostContent): string {
  const publishedDate = formatDate(post.publishedAt);
  const updatedDate = formatDate(post.updatedAt);
  const draft = post.draft ? `<span${cls("PostDetail", "draft")}>下書き</span>` : "";
  const published = `<span>公開日 <time datetime="${escapeHtml(post.publishedAt)}">${publishedDate}</time></span>`;
  // 日本時間で公開日と違う日に更新したときだけ出す。公開後の更新に限る（予約公開では updatedAt が publishedAt より前になり得る）
  const isUpdateShown = updatedDate !== publishedDate && Date.parse(post.updatedAt) > Date.parse(post.publishedAt);
  const updated = isUpdateShown ? `<span>更新日 <time datetime="${escapeHtml(post.updatedAt)}">${updatedDate}</time></span>` : "";

  return `<p${cls("PostDetail", "dates")}>${draft}${published}${updated}</p>`;
}
