import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { loadPostDirectory, parseFrontmatter, type WorkPostContent } from "./markdown-posts.ts";
import fixture from "./markdown-posts.cases.json" with { type: "json" };

describe("parseFrontmatter", () => {
  test("引用符付きの文字列、真偽値、素の文字列を読み、本文を分ける", () => {
    const parsed = parseFrontmatter(
      [
        "---",
        'title: "引用符 \\"付き\\" # コメントではない"',
        "summary: 'シングル''引用符'",
        "publishedAt: 2026-10-10T09:00:00+09:00 # 行末のコメント",
        "draft: true",
        "marp: No",
        "theme: default",
        "---",
        "# 本文",
      ].join("\n"),
    );
    assert.ok(typeof parsed === "object", String(parsed));
    assert.deepEqual(parsed.data, {
      title: '引用符 "付き" # コメントではない',
      summary: "シングル'引用符",
      publishedAt: "2026-10-10T09:00:00+09:00",
      draft: true,
      marp: false,
      theme: "default",
    });
    assert.deepEqual(parsed.blockKeys, []);
    assert.equal(parsed.body, "# 本文");
  });

  test("BOM と CRLF を取り除く", () => {
    const parsed = parseFrontmatter("﻿---\r\ntitle: タイトル\r\n---\r\n本文\r\n");
    assert.ok(typeof parsed === "object", String(parsed));
    assert.deepEqual(parsed.data, { title: "タイトル" });
    assert.equal(parsed.body, "本文\n");
  });

  test("ブロックはキーだけを返し、中身の行は読まない", () => {
    const parsed = parseFrontmatter(["---", "style: |", "  draft: true", "---", ""].join("\n"));
    assert.ok(typeof parsed === "object", String(parsed));
    assert.deepEqual(parsed.data, {});
    assert.deepEqual(parsed.blockKeys, ["style"]);
  });

  test("読めない行は、行番号と理由をまとめて返す", () => {
    const parsed = parseFrontmatter(["---", "draft:true", "  draft: true", "title: 2048", "---", ""].join("\n"));
    assert.equal(typeof parsed, "string");
    assert.match(String(parsed), /frontmatter の 2 行目: 「key: value」の形で読めません/);
    assert.match(String(parsed), /frontmatter の 3 行目: インデントした行は読めません/);
    assert.match(String(parsed), /frontmatter の 4 行目: title の値が数値や日付として読まれます/);
  });

  test("1 行のリストは要素の文字列の配列にし、要素の前後の空白とリストの後ろのコメントは読まない", () => {
    const parsed = parseFrontmatter(["---", "tech: [ TypeScript ,Node.js, C#] # メモ", "---", ""].join("\n"));
    assert.ok(typeof parsed === "object", String(parsed));
    assert.deepEqual(parsed.data, { tech: ["TypeScript", "Node.js", "C#"] });
  });

  test("リストの要素に書けない値は、理由を返す", () => {
    const reason = (value: string) => parseFrontmatter(["---", `tech: ${value}`, "---", ""].join("\n"));
    assert.match(String(reason("[]")), /リストが空です/);
    assert.match(String(reason("[a, ]")), /リストに空の要素があります/);
    assert.match(String(reason("[a, [b]]")), /\[…\] を読めません/);
    assert.match(String(reason("[a #b]")), /リストの要素に括弧か「 #」があります/);
    assert.match(String(reason("[on]")), /リストの要素が真偽値として読まれます: on/);
    assert.match(String(reason("[1.0]")), /リストの要素は素の文字列で書く（値が数値や日付として読まれます/);
  });

  test("先頭が --- でない、閉じの --- が無ければ理由を返す", () => {
    assert.equal(parseFrontmatter("# 本文だけ"), "先頭に --- で囲んだ frontmatter がありません");
    assert.equal(parseFrontmatter("\n---\ntitle: a\n---\n"), "先頭に --- で囲んだ frontmatter がありません");
    assert.equal(parseFrontmatter("---\ntitle: a\n"), "frontmatter の閉じの --- がありません");
  });
});

describe("loadPostDirectory", () => {
  let dir: string;

  before(() => {
    dir = mkdtempSync(path.join(tmpdir(), "markdown-posts-"));
    const write = (file: string, lines: string[]) => writeFileSync(path.join(dir, file), lines.join("\n"));
    write("draft-post.md", [
      "---",
      "title: 下書きの記事",
      "summary: 概要",
      "publishedAt: 2999-01-01T09:00:00+09:00",
      "draft: true",
      "---",
      "# 本文",
    ]);
    write("slides.md", [
      "---",
      "title: スライド",
      "summary: 概要",
      "publishedAt: 2026-10-01T00:00:00Z",
      "marp: yes",
      "# メモ",
      "theme: default",
      "paginate: on",
      "style: |",
      "  section { color: black; }",
      "---",
      "# 1 枚目",
    ]);
    write("published.md", [
      "---",
      "title: 公開済み",
      'summary: "概要"',
      "publishedAt: 2026-09-28T00:00:00+09:00",
      "---",
      "# 概要",
    ]);
    write("no-title.md", ["---", "summary: 概要", "publishedAt: 2026-10-01T00:00:00Z", "---", "本文"]);
    write("bad-date.md", ["---", "title: t", "summary: s", "publishedAt: 2026-10-01T09:00:00", "---", "本文"]);
    writeFileSync(path.join(dir, "not-utf8.md"), Buffer.from([0x2d, 0x2d, 0x2d, 0x0a, 0xff, 0x0a]));
    write(".hidden.md", ["---", "title: 隠し", "---", "本文"]);
    write(".gitkeep", [""]);
    write("readme.txt", ["メモ"]);
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  test("ファイル名順に読み、下書きと未来の日時も含める。publishedAt は UTC にそろえる", () => {
    const posts = loadPostDirectory(dir, () => {});
    assert.deepEqual(
      posts.map((post) => post.slug),
      ["draft-post", "published", "slides"],
    );
    assert.deepEqual(posts[0], {
      slug: "draft-post",
      title: "下書きの記事",
      summary: "概要",
      bodyMarkdown: "# 本文",
      publishedAt: "2999-01-01T00:00:00.000Z",
      updatedAt: "2999-01-01T00:00:00.000Z",
      draft: true,
    });
    assert.equal(posts[1].draft, undefined);
    assert.equal(posts[1].publishedAt, "2026-09-27T15:00:00.000Z");
  });

  test("Marp の記事は title などを除いた frontmatter を本文の先頭に残し、真偽値は true / false に書き直す", () => {
    const slides = loadPostDirectory(dir, () => {}).find((post) => post.slug === "slides");
    assert.equal(
      slides?.bodyMarkdown,
      [
        "---",
        "marp: true",
        "# メモ",
        "theme: default",
        "paginate: true",
        "style: |",
        "  section { color: black; }",
        "---",
        "# 1 枚目",
      ].join("\n"),
    );
  });

  test("読めないファイルと . で始まる .md は理由を警告してスキップする（.md でない . で始まるファイルは黙って読まない）", () => {
    const warnings: string[] = [];
    loadPostDirectory(dir, (message) => warnings.push(message));
    const dirName = path.basename(dir);
    assert.deepEqual(
      warnings.map((warning) => warning.replace(/^\[markdown-posts\] /, "").split(":")[0]),
      [
        `${dirName}/.hidden.md を読みません`,
        `${dirName}/bad-date.md をスキップしました`,
        `${dirName}/no-title.md をスキップしました`,
        `${dirName}/not-utf8.md をスキップしました`,
        `${dirName}/readme.txt を読みません`,
      ],
    );
    assert.match(warnings[1], /publishedAt をオフセット付きの ISO 8601 として読めません/);
    assert.match(warnings[2], /title がありません/);
    assert.match(warnings[3], /UTF-8 として読めません/);
  });

  test("warn で例外を投げれば、最初の読めないファイルで止まる（ビルドを止めたい呼び出し側のため）", () => {
    assert.throws(
      () =>
        loadPostDirectory(dir, (message) => {
          throw new Error(message);
        }),
      /\.hidden\.md を読みません/,
    );
  });

  test("ディレクトリが無ければ空の配列", () => {
    assert.deepEqual(loadPostDirectory(path.join(dir, "missing"), () => {}), []);
  });
});

describe("loadPostDirectory の作品の付帯情報（options.work）", () => {
  let dir: string;

  before(() => {
    dir = mkdtempSync(path.join(tmpdir(), "markdown-posts-work-"));
    const head = ["---", "title: t", "summary: s", "publishedAt: 2026-10-01T00:00:00Z"];
    const write = (file: string, lines: string[]) => writeFileSync(path.join(dir, file), [...head, ...lines].join("\n"));
    write("meta.md", ["badge: oss", "tech: [TypeScript, Node.js]", "repository: https://github.com/example/a", "---", "# 本文"]);
    write("plain.md", ["---", "# 本文"]);
    write("slides.md", ["marp: true", "theme: default", "badge: live", "tech: [Marp]", "---", "# 1 枚目"]);
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  test("作品として読むと、付帯情報を付ける。書いていない作品は tech だけが空の配列", () => {
    const posts = loadPostDirectory(dir, () => {}, { work: true });
    const bySlug = new Map(posts.map((post) => [post.slug, post]));
    assert.deepEqual(
      { badge: bySlug.get("meta")?.badge, tech: bySlug.get("meta")?.tech, repositoryUrl: bySlug.get("meta")?.repositoryUrl },
      { badge: "oss", tech: ["TypeScript", "Node.js"], repositoryUrl: "https://github.com/example/a" },
    );
    assert.equal(bySlug.get("meta")?.bodyMarkdown, "# 本文");
    const plain = bySlug.get("plain");
    assert.deepEqual(plain?.tech, []);
    assert.ok(plain && !("badge" in plain) && !("repositoryUrl" in plain));
  });

  test("Marp の作品でも、付帯情報は本文の先頭の frontmatter に残さない", () => {
    const slides = loadPostDirectory(dir, () => {}, { work: true }).find((post) => post.slug === "slides");
    assert.equal(slides?.bodyMarkdown, ["---", "marp: true", "theme: default", "---", "# 1 枚目"].join("\n"));
    assert.equal(slides?.badge, "live");
  });

  test("作品として読まない（ブログ）と、付帯情報のキーは知らないキーとしてエラーにし、付帯情報も付けない", () => {
    const warnings: string[] = [];
    const posts = loadPostDirectory(dir, (message) => warnings.push(message));
    assert.deepEqual(
      posts.map((post) => post.slug),
      ["plain"],
    );
    assert.ok(!("tech" in posts[0]));
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /meta\.md をスキップしました: badge は読めません/);
    assert.match(warnings[1], /slides\.md をスキップしました: badge は読めません/);
  });
});

// markdown-posts.cases.json のケース。API の取り込み側のテストも同じケースを流し、同じ判定になることを確かめる
interface FixtureCase {
  name: string;
  file?: string;
  /** true なら作品として読む（作品の付帯情報を許す） */
  work?: boolean;
  lines: string[];
  expect: "post" | "error" | "ignored";
  draft?: boolean;
  title?: string;
  /** 作品として読む post のケースで比べる付帯情報（書いていなければ無し） */
  badge?: string;
  tech?: string[];
  repository?: string;
}

describe("markdown-posts.cases.json", () => {
  const cases = fixture.cases as FixtureCase[];
  let root: string;

  before(() => {
    root = mkdtempSync(path.join(tmpdir(), "markdown-posts-cases-"));
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  test("ケースがある（読み込みの検算）", () => {
    assert.ok(cases.length > 0);
  });

  cases.forEach((testCase, index) => {
    test(testCase.name, () => {
      const dir = path.join(root, String(index), "blog");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, testCase.file ?? "a.md"), testCase.lines.join("\n"));
      const warnings: string[] = [];
      const warn = (message: string) => warnings.push(message);
      const posts = testCase.work ? loadPostDirectory(dir, warn, { work: true }) : loadPostDirectory(dir, warn);

      if (testCase.expect === "post") {
        assert.deepEqual(warnings, []);
        assert.equal(posts.length, 1);
        assert.equal(posts[0].draft ?? false, testCase.draft);
        assert.equal(posts[0].title, testCase.title);
        if (testCase.work) {
          const { badge, tech, repositoryUrl } = posts[0] as WorkPostContent;
          assert.deepEqual(
            { badge, tech, repositoryUrl },
            { badge: testCase.badge, tech: testCase.tech ?? [], repositoryUrl: testCase.repository },
          );
        }
      } else {
        assert.equal(warnings.length, testCase.expect === "error" ? 1 : 0, warnings.join("\n"));
        assert.deepEqual(posts, []);
      }
    });
  });
});
