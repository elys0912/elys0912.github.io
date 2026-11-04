// タグのまとめ。記事の frontmatter の tags（shared/lib/markdown-posts.ts が検査済み）を、タグごとに分ける。
// タグの一覧ページ（/tags/）、タグごとの一覧ページ（/tags/<タグ>/）、サイドバー、sitemap が使う。
//
// タグは out/tags/<タグ>/ のディレクトリ名になる（URL は encodeURIComponent、ディレクトリ名は元の文字のまま）。
// 共有部品の検査（空白、「,」、「/」を含めない）に加えて、ディレクトリ名にできないタグはビルドを止める。
// - 「.」で始まる：「.」「..」は別のディレクトリを指す。ほかも隠しファイルになり、upload-pages-artifact が配信物から外す
// - 「.」で終わる、\ : * ? " < > | を含む：Windows で作れないか、末尾の「.」が落ちて別のタグと同じ名前になる
// - 大文字と小文字だけが違うタグ（aws と AWS）：Windows と macOS で同じディレクトリになり、片方を上書きする

import type { PostContent } from "../shared/lib/post-types.ts";

/** 1 つのタグの記事。posts は渡した順のまま */
export type TagArchive = { tag: string; posts: PostContent[] };

/** ディレクトリ名にできないタグ */
const UNSAFE_TAG = /^\.|\.$|[\\:*?"<>|]/;

/**
 * 記事をタグごとに分ける。並びは記事の多い順、同数ならタグの文字コード順（ビルド環境のロケールに左右されないため）。
 * 1 つの記事は付けたタグの数だけ現れる。ディレクトリ名にできないタグがあれば例外を投げる
 */
export function groupPostsByTag(posts: readonly PostContent[]): TagArchive[] {
  const postsByTag = new Map<string, PostContent[]>();
  for (const post of posts) {
    for (const tag of post.tags ?? []) {
      const tagPosts = postsByTag.get(tag);
      if (tagPosts === undefined) postsByTag.set(tag, [post]);
      else tagPosts.push(post);
    }
  }

  assertTagsUsableAsDirectoryNames([...postsByTag.keys()]);

  return [...postsByTag]
    .map(([tag, tagPosts]) => ({ tag, posts: tagPosts }))
    .sort((a, b) => b.posts.length - a.posts.length || compareCodeUnits(a.tag, b.tag));
}

/** タグがすべて out/tags/<タグ>/ のディレクトリ名にできることを確かめる。できないタグがあれば例外を投げる */
function assertTagsUsableAsDirectoryNames(tags: readonly string[]): void {
  const problems = tags.filter((tag) => UNSAFE_TAG.test(tag)).map((tag) => `ディレクトリ名にできないタグ: ${tag}`);
  const tagsByLowerCase = Map.groupBy(tags, (tag) => tag.toLowerCase());
  for (const sameNameTags of tagsByLowerCase.values()) {
    if (sameNameTags.length > 1) problems.push(`大文字と小文字だけが違うタグ: ${sameNameTags.join("、")}`);
  }

  if (problems.length > 0) throw new Error(`記事の tags を直してください\n${problems.join("\n")}`);
}

/** 文字コード（UTF-16 のコード単位）の順 */
function compareCodeUnits(a: string, b: string): number {
  if (a === b) return 0;

  return a < b ? -1 : 1;
}
