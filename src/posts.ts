// content/blog/*.md を読み、サイトに出す記事を返す。1 ファイルの読み方は shared/lib/markdown-posts.ts（共有の部品）が担う。
// ここではブログの規則を足す。
//
// このリポジトリは公開リポジトリ。置いた記事はサイトに出なくても誰でも読める。そのため、公開する記事だけを置く。
// 次のどれかがあれば、ビルドを止める（loadPosts が例外を投げる）。
// - 読めないファイル（frontmatter の誤り、. で始まる .md、.md でないファイルなど。markdown-posts.ts の規則）
// - slug（ファイル名）の形の誤り
// - 本文が MAX_BODY_BYTES を超える
// - draft: true の記事（下書きはこのリポジトリの外で書く）
// - publishedAt が未来の記事（予約公開はしない）
//
// 画像の参照の拾い方は src/images.ts。

import path from "node:path";

import { loadPostDirectory } from "../shared/lib/markdown-posts.ts";
import type { PostContent } from "../shared/lib/post-types.ts";

/** リポジトリのルートから見た content/ と、記事と画像を置くディレクトリの名前 */
export const CONTENT_DIRECTORY = "content";
export const POSTS_DIRECTORY_NAME = "blog";
export const IMAGES_DIRECTORY_NAME = "images";

/** slug（ファイル名から .md を除いたもの）。URL と画像のディレクトリ名に使う */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 本文（Marp の記事は先頭に残す frontmatter を含む）の UTF-8 のバイト数（128KB） */
const MAX_BODY_BYTES = 128 * 1024;

/**
 * content/blog/ の記事を読んで検査し、サイトに出す記事を公開日時の新しい順（同時刻なら slug 順）に返す。
 * 問題が 1 件でもあれば、まとめて例外を投げる。
 */
export function loadPosts(contentDir: string, now: Date): PostContent[] {
  const problems: string[] = [];
  const posts = loadPostDirectory(path.join(contentDir, POSTS_DIRECTORY_NAME), (message) => problems.push(message));
  for (const post of posts) problems.push(...postProblems(post, now));

  if (problems.length > 0) {
    const list = problems.map((problem) => `  - ${problem}`).join("\n");
    throw new Error(`content/blog/ の記事を検査して ${problems.length} 件の問題がありました:\n${list}`);
  }

  return posts.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.slug.localeCompare(b.slug));
}

/** 1 記事分の、ブログの規則に合わない点 */
function postProblems(post: PostContent, now: Date): string[] {
  const label = `${POSTS_DIRECTORY_NAME}/${post.slug}.md`;
  const problems: string[] = [];

  if (!SLUG_PATTERN.test(post.slug)) {
    problems.push(`${label}: ファイル名（slug）は英小文字・数字と - だけにする（例: first-post.md）`);
  }
  const bytes = new TextEncoder().encode(post.bodyMarkdown).length;
  if (bytes > MAX_BODY_BYTES) {
    problems.push(`${label}: 本文が ${bytes} バイトあります。${MAX_BODY_BYTES} バイト（128KB）までにする（記事を分ける）`);
  }
  if (post.draft) {
    problems.push(`${label}: draft: true の記事は置かない（公開できる状態になってから draft の行を消して置く）`);
  }
  if (Date.parse(post.publishedAt) > now.getTime()) {
    problems.push(`${label}: publishedAt（${post.publishedAt}、UTC）が未来です。公開する日時になってから置く`);
  }

  return problems;
}
