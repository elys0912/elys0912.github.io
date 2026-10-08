// content/ の規則のうち、ビルド（lib/posts.ts）と検査（scripts/*.mjs）が共通で使うもの。依存なし。

/** リポジトリのルートから見た content/ と、記事を置くディレクトリの名前 */
export const CONTENT_DIRECTORY = "content";
export const POSTS_DIRECTORY_NAME = "blog";

/** slug（ファイル名から .md を除いたもの）。URL と画像のディレクトリ名に使う */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * output: "export" では generateStaticParams が 1 件以上返さないとビルドが失敗する。
 * 記事が 0 件のときだけこの slug を 1 件返し、そのページは notFound() にする。
 * SLUG_PATTERN に合わないので実在の記事と衝突しない。出力されたページは scripts/postbuild.mjs が out/ から取り除く
 */
export const PLACEHOLDER_SLUG = "__placeholder__";

/** content/blog/ に置いてよい、. で始まる名前（git に空のディレクトリを残すためのもの） */
const ALLOWED_DOTFILES = new Set([".gitkeep"]);

/**
 * content/blog/ の中の、置いてはいけない . で始まる名前。
 * 記事の読み込み（lib/markdown-posts.ts）は . で始まる名前を読まないので、そこに記事を置くと検査をすり抜ける
 * @param {string[]} names ディレクトリの中の名前
 * @returns {string[]}
 */
export function unexpectedDotfiles(names) {
  return names.filter((name) => name.startsWith(".") && !ALLOWED_DOTFILES.has(name));
}

/** 記事の読み込み（lib/markdown-posts.ts）が draft の値として読む書き方。値の後ろの ` # …` はコメント */
const DRAFT_LINE = /^draft:\s+(?:true|True|TRUE|false|False|FALSE)(?:\s+#.*)?\s*$/;

/**
 * frontmatter の draft の行のうち、記事の読み込みが draft として読めない書き方のもの
 * （`draft:true`、`Draft: true`、インデントした行、値が空や yes など）。
 * 読めない書き方の draft は下書きと見なされずに公開されるので、ビルドも検査も失敗させるために使う。
 * frontmatter の範囲は記事の読み込みと同じ（BOM を除き、先頭の行が --- で、次の --- まで）。frontmatter が無ければ空
 * @param {string} text ファイルの中身
 * @returns {string[]} 該当する行
 */
export function malformedDraftLines(text) {
  const lines = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  if (lines[0] !== "---") return [];
  const end = lines.indexOf("---", 1);
  if (end < 0) return [];
  return lines.slice(1, end).filter((line) => /^\s*draft\s*:/i.test(line) && !DRAFT_LINE.test(line));
}
