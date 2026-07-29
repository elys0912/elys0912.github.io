// content/blog/*.md を読み、サイトに出す記事を返す。ビルド時（Server Components の描画中）にだけ使う。
// node:fs を使うので、クライアントのコンポーネントから import しないこと。
//
// - 1 ファイルの読み方は lib/markdown-posts.ts（共有の部品）に任せ、ここではブログの規則を足す
// - 次のどれかがあれば、例外を投げてビルドを止める（scripts/check-drafts.mjs も同じ readPosts で検査する）
//   読めないファイル、. で始まる名前のファイル（.gitkeep を除く）、draft の行の書き方の誤り、slug の形の誤り、
//   本文が上限を超えるファイル、外部の URL などの画像を参照するファイル
// - サイトに出すのは、下書き（draft: true）でなく、publishedAt がビルドの時刻以前の記事だけ
//   （CI では scripts/check-drafts.mjs が、どちらも content/ に置かれていないことを確かめる）

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
// node --test と scripts/*.mjs からも読み込めるよう、拡張子付きで import する
import { extractImageSources, imageKeyOf } from "../scripts/content-images.mjs";
import { MAX_BODY_BYTES } from "../scripts/content-limits.mjs";
import {
  CONTENT_DIRECTORY,
  malformedDraftLines,
  PLACEHOLDER_SLUG,
  POSTS_DIRECTORY_NAME,
  SLUG_PATTERN,
  unexpectedDotfiles,
} from "../scripts/content-rules.mjs";
import { loadPostDirectory } from "./markdown-posts.ts";
import type { PostContent } from "./post-types.ts";

export { PLACEHOLDER_SLUG, SLUG_PATTERN };

const MARKDOWN_SUFFIX = ".md";

/**
 * ディレクトリの記事を、下書きと未来の publishedAt も含めてすべて読む（並びはファイル名順）。
 * problems には、読めないファイルとブログの規則に合わないファイルの理由を入れる（その記事は posts に入れない）。
 * ディレクトリが無ければ記事 0 件。
 */
export function readPosts(dir: string): { posts: PostContent[]; problems: string[] } {
  const problems: string[] = [];
  const dirName = path.basename(dir);
  const names = isDirectory(dir) ? readdirSync(dir).sort() : [];

  for (const name of unexpectedDotfiles(names)) {
    problems.push(`${dirName}/${name}: . で始まる名前のファイルは置かない（読み込まれず、検査もすり抜ける）`);
  }

  // ファイルの中身で見る規則（記事の読み込みが読み飛ばす書き方の draft と、frontmatter や HTML のコメントの中の画像も見る）
  const rejected = new Set<string>();
  for (const name of names) {
    const file = path.join(dir, name);
    if (name.startsWith(".") || !name.endsWith(MARKDOWN_SUFFIX) || !statSync(file).isFile()) continue;
    const slug = name.slice(0, -MARKDOWN_SUFFIX.length);
    const label = `${dirName}/${name}`;
    const text = readFileSync(file, "utf8");
    const reasons = [...draftLineProblems(text), ...imageProblems(text)];
    for (const reason of reasons) problems.push(`${label}: ${reason}`);
    if (reasons.length > 0) rejected.add(slug);
  }

  const posts = loadPostDirectory(dir, (message) => problems.push(message)).filter((post) => {
    if (rejected.has(post.slug)) return false;
    const label = `${dirName}/${post.slug}.md`;
    if (!SLUG_PATTERN.test(post.slug)) {
      problems.push(`${label}: ファイル名（slug）は英小文字・数字と - だけにする（例: first-post.md）`);
      return false;
    }
    const bytes = new TextEncoder().encode(post.bodyMarkdown).length;
    if (bytes > MAX_BODY_BYTES) {
      problems.push(`${label}: 本文が ${bytes} バイトあります。${MAX_BODY_BYTES} バイト（128KB）までにする（記事を分ける）`);
      return false;
    }
    return true;
  });
  return { posts, problems };
}

/** 記事の読み込みが draft として読めない書き方の draft の行（読めないと下書きが公開されてしまう） */
function draftLineProblems(text: string): string[] {
  return malformedDraftLines(text).map(
    (line) => `draft の行を読めません（行頭から \`draft: true\` か \`draft: false\` と書く）: ${line.trim()}`,
  );
}

/** 画像は content/images/<slug>/ に置いたものだけ。外部の URL などはビルドでも拒否する（画像の有無やサイズは scripts/check-images.mjs） */
function imageProblems(text: string): string[] {
  const invalid = extractImageSources(text).flatMap(({ src, line }) => {
    const key = imageKeyOf(src);
    return typeof key === "string" ? [] : [`${line} 行目 ${src}（${key.reason}）`];
  });
  return invalid.length > 0 ? [`画像の参照は /images/<slug>/<ファイル名> だけ: ${invalid.join("、")}`] : [];
}

/** readPosts と同じだが、問題が 1 件でもあれば例外を投げる（ビルドを止める） */
export function loadPosts(dir: string): PostContent[] {
  const { posts, problems } = readPosts(dir);
  if (problems.length > 0) {
    throw new Error(`content/ の記事を読めません（${problems.length} 件）:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
  return posts;
}

/** サイトに出す記事かどうか。下書きでなく、publishedAt が now 以前 */
export function isPublished(post: PostContent, now: Date): boolean {
  return !post.draft && Date.parse(post.publishedAt) <= now.getTime();
}

/** サイトに出す記事だけを、公開日時の新しい順に返す（同時刻ならファイル名順） */
export function selectPublished(posts: readonly PostContent[], now: Date): PostContent[] {
  return posts
    .filter((post) => isPublished(post, now))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.slug.localeCompare(b.slug));
}

/** 記事の詳細ページの generateStaticParams が返す値。0 件なら仮の slug を 1 件（PLACEHOLDER_SLUG の説明を参照） */
export function toSlugParams(posts: readonly PostContent[]): { slug: string }[] {
  if (posts.length === 0) return [{ slug: PLACEHOLDER_SLUG }];
  return posts.map((post) => ({ slug: post.slug }));
}

let cached: PostContent[] | undefined;

/**
 * サイトに出す記事（新しい順）。記事はリポジトリのルート（ビルドを実行するディレクトリ）の content/blog/ から読む。
 * ビルドでは 1 回だけ読み、開発サーバーでは Markdown の編集をすぐ反映するため毎回読み直す
 */
export function listPublishedPosts(): PostContent[] {
  if (cached) return cached;
  const dir = path.join(process.cwd(), CONTENT_DIRECTORY, POSTS_DIRECTORY_NAME);
  const posts = selectPublished(loadPosts(dir), new Date());
  if (process.env.NODE_ENV === "production") cached = posts;
  return posts;
}

/** サイトに出す記事を slug で探す。無ければ（下書き・未来の記事も）undefined */
export function getPublishedPost(slug: string): PostContent | undefined {
  return listPublishedPosts().find((post) => post.slug === slug);
}

function isDirectory(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}
