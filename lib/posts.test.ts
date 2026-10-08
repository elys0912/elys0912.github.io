import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { MAX_BODY_BYTES } from "../scripts/content-limits.mjs";
import type { PostContent } from "./post-types.ts";
import {
  isPublished,
  loadPosts,
  PLACEHOLDER_SLUG,
  readPosts,
  selectPublished,
  SLUG_PATTERN,
  toSlugParams,
} from "./posts.ts";

const roots: string[] = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** 一時ディレクトリに記事を置く。キーはファイル名、値は中身 */
function makeDir(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "posts-"));
  roots.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text);
  return dir;
}

function markdown(frontmatter: string[], body = "本文"): string {
  return ["---", "title: タイトル", "summary: 概要", ...frontmatter, "---", body, ""].join("\n");
}

function post(overrides: Partial<PostContent> & Pick<PostContent, "slug" | "publishedAt">): PostContent {
  return {
    title: "タイトル",
    summary: "概要",
    bodyMarkdown: "本文",
    updatedAt: overrides.publishedAt,
    ...overrides,
  };
}

describe("readPosts", () => {
  test("記事を読み、draft と未来の publishedAt の記事も含める", () => {
    const dir = makeDir({
      "a-post.md": markdown(["publishedAt: 2026-10-01T09:00:00+09:00"]),
      "draft-post.md": markdown(["publishedAt: 2026-10-01T09:00:00+09:00", "draft: true"]),
      "future-post.md": markdown(["publishedAt: 2099-01-01T09:00:00+09:00"]),
    });
    const { posts, problems } = readPosts(dir);
    assert.deepEqual(problems, []);
    assert.deepEqual(
      posts.map((p) => [p.slug, p.publishedAt, p.draft ?? false]),
      [
        ["a-post", "2026-10-01T00:00:00.000Z", false],
        ["draft-post", "2026-10-01T00:00:00.000Z", true],
        ["future-post", "2099-01-01T00:00:00.000Z", false],
      ],
    );
  });

  test("ディレクトリが無ければ 0 件で、問題なし", () => {
    assert.deepEqual(readPosts(path.join(tmpdir(), "posts-does-not-exist")), { posts: [], problems: [] });
  });

  test("読めないファイル、.md 以外のファイル、slug の形が違うファイルは problems に入れ、posts に入れない", () => {
    const dir = makeDir({
      "no-frontmatter.md": "# 本文だけ\n",
      "no-title.md": ["---", "summary: 概要", "publishedAt: 2026-10-01T09:00:00+09:00", "---", "本文"].join("\n"),
      "bad-date.md": markdown(["publishedAt: 2026-10-01"]),
      "Upper_Case.md": markdown(["publishedAt: 2026-10-01T09:00:00+09:00"]),
      "memo.txt": "メモ",
      "ok-post.md": markdown(["publishedAt: 2026-10-01T09:00:00+09:00"]),
    });
    const { posts, problems } = readPosts(dir);
    assert.deepEqual(
      posts.map((p) => p.slug),
      ["ok-post"],
    );
    assert.equal(problems.length, 5, problems.join("\n"));
    assert.ok(problems.some((p) => p.includes("Upper_Case.md") && p.includes("slug")));
    assert.ok(problems.some((p) => p.includes("memo.txt")));
  });

  test("本文がちょうど上限なら読め、1 バイトでも超えれば problems に入れる", () => {
    // 本文は閉じの --- の次の行から末尾まで（末尾の改行を含む）なので、"a" の数 + 1 バイトになる
    const dir = makeDir({
      "limit.md": markdown(["publishedAt: 2026-10-01T09:00:00+09:00"], "a".repeat(MAX_BODY_BYTES - 1)),
      "over.md": markdown(["publishedAt: 2026-10-01T09:00:00+09:00"], "a".repeat(MAX_BODY_BYTES)),
    });
    const { posts, problems } = readPosts(dir);
    assert.deepEqual(
      posts.map((p) => p.slug),
      ["limit"],
    );
    assert.deepEqual(problems, [
      `${path.basename(dir)}/over.md: 本文が ${MAX_BODY_BYTES + 1} バイトあります。${MAX_BODY_BYTES} バイト（128KB）までにする（記事を分ける）`,
    ]);
  });

  test("外部の URL、data:、相対パスの画像を参照する記事は problems に入れる。/images/<slug>/ は読める", () => {
    const dir = makeDir({
      "external.md": markdown(["publishedAt: 2026-10-01T09:00:00+09:00"], "![図](https://example.com/a.png)"),
      "protocol-relative.md": markdown(["publishedAt: 2026-10-01T09:00:00+09:00"], '<img src="//example.com/a.png">'),
      "data-url.md": markdown(["publishedAt: 2026-10-01T09:00:00+09:00"], "![図](data:image/png;base64,AAAA)"),
      "relative.md": markdown(["publishedAt: 2026-10-01T09:00:00+09:00"], "![図](a.png)"),
      "local.md": markdown(["publishedAt: 2026-10-01T09:00:00+09:00"], "![図](/images/local/a.png)"),
    });
    const { posts, problems } = readPosts(dir);
    assert.deepEqual(
      posts.map((p) => p.slug),
      ["local"],
    );
    assert.equal(problems.length, 4, problems.join("\n"));
    assert.match(problems.find((p) => p.includes("/external.md")) ?? "", /外部の URL は使わない/);
    assert.match(problems.find((p) => p.includes("/protocol-relative.md")) ?? "", /外部の URL は使わない/);
    assert.match(problems.find((p) => p.includes("/data-url.md")) ?? "", /data: URL は使わない/);
    assert.match(problems.find((p) => p.includes("/relative.md")) ?? "", /相対パスは使わない/);
  });
});

describe("readPosts（記事の読み込みがすり抜ける書き方）", () => {
  test("draft と読めない書き方の draft の行がある記事は、公開されないよう problems に入れ、posts に入れない", () => {
    const dir = makeDir({
      "no-space.md": markdown(["publishedAt: 2026-10-01T09:00:00+09:00", "draft:true"]),
      "upper-key.md": markdown(["publishedAt: 2026-10-01T09:00:00+09:00", "Draft: true"]),
      "indented.md": markdown(["publishedAt: 2026-10-01T09:00:00+09:00", "  draft: true"]),
      "ok-post.md": markdown(["publishedAt: 2026-10-01T09:00:00+09:00", "draft: false"]),
    });
    const { posts, problems } = readPosts(dir);
    assert.deepEqual(
      posts.map((p) => p.slug),
      ["ok-post"],
    );
    // ブログの規則と、共有の記事の読み込みの規則の両方が指摘する（どちらか一方が緩んでも止まる）
    for (const name of ["no-space.md", "upper-key.md", "indented.md"]) {
      assert.ok(
        problems.some((p) => p.includes(`/${name}: draft の行を読めません`)),
        `${name} の指摘がありません:\n${problems.join("\n")}`,
      );
    }
    assert.ok(problems.every((p) => !p.includes("ok-post.md")), problems.join("\n"));
  });

  test(". で始まる名前のファイルは .gitkeep を除いて problems に入れる", () => {
    const dir = makeDir({
      ".gitkeep": "",
      ".hidden.md": markdown(["publishedAt: 2026-10-01T09:00:00+09:00", "draft: true"]),
    });
    const { posts, problems } = readPosts(dir);
    assert.deepEqual(posts, []);
    // ブログの規則と、共有の記事の読み込みの規則の両方が指摘する。.gitkeep は指摘しない
    assert.ok(
      problems.includes(`${path.basename(dir)}/.hidden.md: . で始まる名前のファイルは置かない（読み込まれず、検査もすり抜ける）`),
      problems.join("\n"),
    );
    assert.ok(problems.every((p) => p.includes(".hidden.md")), problems.join("\n"));
  });

  test("Marp の記事は、frontmatter の style と HTML のコメントの指定の url(…) も画像の参照として調べる", () => {
    const marp = (lines: string[], body: string) =>
      ["---", "title: t", "summary: s", "publishedAt: 2026-10-01T09:00:00+09:00", "marp: true", ...lines, "---", body, ""].join(
        "\n",
      );
    const dir = makeDir({
      "style-url.md": marp(["style: |", "  section { background: url(https://example.com/a.png) }"], "# 1 枚目"),
      "comment-url.md": marp([], "<!-- _backgroundImage: url('https://example.com/b.png') -->\n\n# 1 枚目"),
      "local-url.md": marp([], "<!-- _backgroundImage: url(/images/local-url/bg.png) -->\n\n```css\nurl(https://example.com/in-code.png)\n```"),
    });
    const { posts, problems } = readPosts(dir);
    assert.deepEqual(
      posts.map((p) => p.slug),
      ["local-url"],
    );
    assert.equal(problems.length, 2, problems.join("\n"));
    assert.match(problems.find((p) => p.includes("/style-url.md")) ?? "", /https:\/\/example\.com\/a\.png（外部の URL は使わない）/);
    assert.match(problems.find((p) => p.includes("/comment-url.md")) ?? "", /https:\/\/example\.com\/b\.png（外部の URL は使わない）/);
  });
});

describe("loadPosts", () => {
  test("問題があれば、すべての理由を並べた例外を投げる（ビルドを止める）", () => {
    const dir = makeDir({ "a.md": "# 本文だけ\n", "b.md": "# 本文だけ\n" });
    assert.throws(() => loadPosts(dir), /content\/ の記事を読めません（2 件）/);
  });

  test("問題が無ければ記事を返す", () => {
    const dir = makeDir({ "a.md": markdown(["publishedAt: 2026-10-01T09:00:00+09:00"]) });
    assert.equal(loadPosts(dir).length, 1);
  });
});

describe("isPublished / selectPublished", () => {
  const now = new Date("2026-10-08T00:00:00Z");

  test("下書きと、publishedAt が now より後の記事は出さない。now ちょうどは出す", () => {
    assert.equal(isPublished(post({ slug: "a", publishedAt: "2026-10-01T00:00:00.000Z" }), now), true);
    assert.equal(isPublished(post({ slug: "a", publishedAt: "2026-10-08T00:00:00.000Z" }), now), true);
    assert.equal(isPublished(post({ slug: "a", publishedAt: "2026-10-08T00:00:00.001Z" }), now), false);
    assert.equal(isPublished(post({ slug: "a", publishedAt: "2026-10-01T00:00:00.000Z", draft: true }), now), false);
  });

  test("出す記事だけを公開日時の新しい順に並べ、同時刻は slug 順", () => {
    const posts = [
      post({ slug: "old", publishedAt: "2026-09-01T00:00:00.000Z" }),
      post({ slug: "draft", publishedAt: "2026-10-01T00:00:00.000Z", draft: true }),
      post({ slug: "new-b", publishedAt: "2026-10-01T00:00:00.000Z" }),
      post({ slug: "future", publishedAt: "2026-12-01T00:00:00.000Z" }),
      post({ slug: "new-a", publishedAt: "2026-10-01T00:00:00.000Z" }),
    ];
    assert.deepEqual(
      selectPublished(posts, now).map((p) => p.slug),
      ["new-a", "new-b", "old"],
    );
  });
});

describe("toSlugParams", () => {
  test("記事が 0 件なら仮の slug を 1 件返す。仮の slug は実在の記事の slug になり得ない", () => {
    assert.deepEqual(toSlugParams([]), [{ slug: PLACEHOLDER_SLUG }]);
    assert.equal(SLUG_PATTERN.test(PLACEHOLDER_SLUG), false);
  });

  test("記事があれば slug を返す", () => {
    assert.deepEqual(toSlugParams([post({ slug: "a", publishedAt: "2026-10-01T00:00:00.000Z" })]), [{ slug: "a" }]);
  });
});
