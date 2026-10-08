// content/blog/ に、公開しない記事を置いていないことを確かめる（npm run check:drafts。CI で動かす）。
//
// このリポジトリは公開されているので、置いた記事はサイトに出なくても誰でも読める。公開する記事だけを置く。
// - draft: true の記事はエラー（下書きはこのリポジトリの外で書く）
// - publishedAt が未来の記事はエラー（予約公開はしない。ビルドもサイトに出さない）
// - 読めない記事はエラー（ビルドと同じ規則。lib/posts.ts の readPosts）：frontmatter の誤り、draft の行の書き方の誤り
//   （draft:true、Draft: true、インデントした行など。読めないと下書きが公開されてしまう）、. で始まる名前のファイル、
//   slug の形、本文の上限、外部の URL などの画像
//
// 読む場所は、環境変数 CONTENT_DIR があればそれを（相対パスは実行時のカレントディレクトリから）、無ければリポジトリの content/。
// エラーはまとめて出し、1 件でもあれば終了コード 1。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPosts } from "../lib/posts.ts";
import { isDirectory, resolveContentDir } from "./content-images.mjs";

/**
 * content/blog/ を検査する。
 * @param {string} contentDir
 * @param {Date} now 未来かどうかの基準
 * @returns {{ errors: string[], postCount: number }} postCount は読めた記事の数
 */
export function checkDrafts(contentDir, now) {
  const { posts, problems } = readPosts(path.join(contentDir, "blog"));
  const errors = [...problems];
  for (const post of posts) {
    const label = `blog/${post.slug}.md`;
    if (post.draft) {
      errors.push(`${label}: draft: true の記事は置かない（公開できる状態になってから draft の行を消して置く）`);
    }
    if (Date.parse(post.publishedAt) > now.getTime()) {
      errors.push(`${label}: publishedAt（${post.publishedAt}、UTC）が未来です。公開する日時になってから置く`);
    }
  }
  return { errors, postCount: posts.length };
}

function main() {
  const { dir, configured } = resolveContentDir();
  if (configured && !isDirectory(dir)) {
    console.error(`CONTENT_DIR のディレクトリが見つかりません: ${dir}`);
    process.exit(1);
  }
  const { errors, postCount } = checkDrafts(dir, new Date());
  if (errors.length > 0) {
    console.error(`content/blog/ の検査で ${errors.length} 件のエラーがありました（${dir}）`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`content/blog/ の検査: 問題なし（記事 ${postCount} 件）`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
