import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, test } from "node:test";
import { checkDrafts } from "./check-drafts.mjs";

const SCRIPT = fileURLToPath(new URL("./check-drafts.mjs", import.meta.url));
const NOW = new Date("2026-10-08T00:00:00Z");
const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** 一時ディレクトリに content/ を組み立てる。キーは content/ からの相対パス */
function makeContent(files) {
  const root = mkdtempSync(path.join(tmpdir(), "check-drafts-"));
  roots.push(root);
  for (const [relative, text] of Object.entries(files)) {
    const file = path.join(root, ...relative.split("/"));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

function post({ publishedAt = "2026-10-01T09:00:00+09:00", draft } = {}) {
  return [
    "---",
    "title: タイトル",
    "summary: 概要",
    `publishedAt: ${publishedAt}`,
    ...(draft === undefined ? [] : [`draft: ${draft}`]),
    "---",
    "本文",
    "",
  ].join("\n");
}

describe("checkDrafts", () => {
  test("公開できる記事だけなら問題なし（draft: false は公開）", () => {
    const dir = makeContent({
      "blog/a-post.md": post(),
      "blog/b-post.md": post({ draft: false }),
      "blog/.gitkeep": "",
    });
    assert.deepEqual(checkDrafts(dir, NOW), { errors: [], postCount: 2 });
  });

  test("blog/ が無ければ記事 0 件で問題なし", () => {
    assert.deepEqual(checkDrafts(makeContent({ "LICENSE.md": "" }), NOW), { errors: [], postCount: 0 });
  });

  test("draft: true の記事はエラー", () => {
    const dir = makeContent({ "blog/a-post.md": post(), "blog/draft-post.md": post({ draft: true }) });
    const { errors } = checkDrafts(dir, NOW);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^blog\/draft-post\.md: draft: true の記事は置かない/);
  });

  test("publishedAt が now より後の記事はエラー。now ちょうどは公開", () => {
    const dir = makeContent({
      "blog/now-post.md": post({ publishedAt: "2026-10-08T09:00:00+09:00" }),
      "blog/future-post.md": post({ publishedAt: "2026-10-08T09:00:01+09:00" }),
    });
    const { errors } = checkDrafts(dir, NOW);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^blog\/future-post\.md: publishedAt（2026-10-08T00:00:01\.000Z、UTC）が未来です/);
  });

  test("記事の読み込みが draft と読めない書き方と、. で始まる名前のファイルはエラー（公開されてしまうので見逃さない）", () => {
    const withDraftLine = (line) =>
      ["---", "title: タイトル", "summary: 概要", "publishedAt: 2026-10-01T09:00:00+09:00", line, "---", "本文", ""].join(
        "\n",
      );
    const dir = makeContent({
      "blog/no-space.md": withDraftLine("draft:true"),
      "blog/upper-key.md": withDraftLine("Draft: true"),
      "blog/indented.md": withDraftLine("  draft: true"),
      "blog/empty-value.md": withDraftLine("draft:"),
      "blog/.hidden.md": post({ draft: true }),
      "blog/.gitkeep": "",
    });
    const { errors, postCount } = checkDrafts(dir, NOW);
    for (const name of ["no-space.md", "upper-key.md", "indented.md", "empty-value.md", ".hidden.md"]) {
      assert.ok(
        errors.some((error) => error.startsWith(`blog/${name}: `)),
        `${name} のエラーがありません:\n${errors.join("\n")}`,
      );
    }
    assert.ok(errors.every((error) => !error.includes(".gitkeep")), errors.join("\n"));
    assert.equal(postCount, 0);
  });

  test("draft の値が真偽値でない、読めない記事もエラー（下書きを見逃さない側に倒す）", () => {
    const dir = makeContent({
      "blog/yes-post.md": post({ draft: "yes" }),
      "blog/no-frontmatter.md": "# 本文だけ\n",
    });
    const { errors } = checkDrafts(dir, NOW);
    // yes-post.md は、ブログの規則（draft は true か false だけ）が指摘する（共有の記事の読み込みは yes を真として読む）
    assert.ok(
      errors.some((error) => error.includes("yes-post.md") && error.includes("draft の行を読めません")),
      errors.join("\n"),
    );
    assert.ok(errors.some((error) => error.includes("no-frontmatter.md")));
  });
});

describe("コマンド", () => {
  const run = (env) =>
    spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, ...env }, encoding: "utf8" });

  test("問題が無ければ終了コード 0", () => {
    const result = run({ CONTENT_DIR: makeContent({ "blog/a-post.md": post() }) });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /問題なし（記事 1 件）/);
  });

  test("draft の記事があれば終了コード 1 で、理由を出す", () => {
    const result = run({ CONTENT_DIR: makeContent({ "blog/draft-post.md": post({ draft: true }) }) });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /1 件のエラー/);
    assert.match(result.stderr, /draft-post\.md: draft: true の記事は置かない/);
  });

  test("CONTENT_DIR で指定したディレクトリが無ければ終了コード 1", () => {
    const result = run({ CONTENT_DIR: path.join(tmpdir(), "check-drafts-does-not-exist") });
    assert.equal(result.status, 1);
  });
});
