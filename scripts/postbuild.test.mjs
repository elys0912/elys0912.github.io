import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { PLACEHOLDER_SLUG } from "./content-rules.mjs";
import { postbuild } from "./postbuild.mjs";

const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** 一時ディレクトリにファイルを置く。キーはルートからの相対パス */
function makeTree(files) {
  const root = mkdtempSync(path.join(tmpdir(), "postbuild-"));
  roots.push(root);
  for (const [relative, data] of Object.entries(files)) {
    const file = path.join(root, ...relative.split("/"));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, data);
  }
  return root;
}

const outputs = {
  "out/sitemap.xml": "<urlset><url><loc>https://example.com/</loc></url></urlset>",
  "out/feed.xml": '<feed><link rel="self" href="https://example.com/feed.xml"/></feed>',
};

const post = (body) => ["---", "title: t", "summary: s", "publishedAt: 2026-10-01T09:00:00+09:00", "---", body, ""].join("\n");

describe("postbuild", () => {
  test("記事 0 件の仮のページを取り除き、空になった out/posts/ も消す", () => {
    const root = makeTree({ ...outputs, [`out/posts/${PLACEHOLDER_SLUG}/index.html`]: "404" });
    const result = postbuild({ outDir: path.join(root, "out"), contentDir: path.join(root, "content") });
    assert.equal(result.removedPlaceholder, true);
    assert.equal(existsSync(path.join(root, "out", "posts")), false);
  });

  test("仮のページが無ければ何も消さない", () => {
    const root = makeTree({ ...outputs, "out/posts/a-post/index.html": "a" });
    const result = postbuild({ outDir: path.join(root, "out"), contentDir: path.join(root, "content") });
    assert.equal(result.removedPlaceholder, false);
    assert.equal(existsSync(path.join(root, "out", "posts", "a-post", "index.html")), true);
  });

  test("sitemap.xml か feed.xml が無い、または中身が足りなければ例外を投げる", () => {
    for (const missing of Object.keys(outputs)) {
      const files = { ...outputs };
      delete files[missing];
      const root = makeTree(files);
      assert.throws(
        () => postbuild({ outDir: path.join(root, "out"), contentDir: path.join(root, "content") }),
        new RegExp(path.basename(missing).replace(".", "\\.")),
      );
    }
    const root = makeTree({ ...outputs, "out/feed.xml": "<feed></feed>" });
    assert.throws(() => postbuild({ outDir: path.join(root, "out"), contentDir: path.join(root, "content") }), /feed\.xml/);
  });

  test("ページを出力した記事から参照されている画像だけを out/images/ にコピーする", () => {
    const root = makeTree({
      ...outputs,
      "out/posts/public-post/index.html": "公開",
      "content/blog/public-post.md": post("![a](/images/public-post/a.png)"),
      // ページが出力されていない（下書き・未来の日付）記事
      "content/blog/hidden-post.md": post("![b](/images/hidden-post/b.png)"),
      "content/images/public-post/a.png": "A",
      "content/images/hidden-post/b.png": "B",
      "content/images/public-post/unused.png": "U",
    });
    const result = postbuild({ outDir: path.join(root, "out"), contentDir: path.join(root, "content") });
    assert.deepEqual(
      { published: result.published, unpublishedOnly: result.unpublishedOnly, unreferenced: result.unreferenced },
      { published: ["public-post/a.png"], unpublishedOnly: ["hidden-post/b.png"], unreferenced: ["public-post/unused.png"] },
    );
    assert.equal(readFileSync(path.join(root, "out", "images", "public-post", "a.png"), "utf8"), "A");
    assert.equal(existsSync(path.join(root, "out", "images", "hidden-post")), false);
    assert.equal(existsSync(path.join(root, "out", "images", "public-post", "unused.png")), false);
  });

  test("content/images/ が無ければ何もコピーしない", () => {
    const root = makeTree({ ...outputs });
    const result = postbuild({ outDir: path.join(root, "out"), contentDir: path.join(root, "content") });
    assert.deepEqual(result.published, []);
    assert.equal(existsSync(path.join(root, "out", "images")), false);
  });
});
