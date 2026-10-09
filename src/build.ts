// サイトのビルド（npm run build → node src/build.ts）。content/ を読み、out/ に静的なファイルをすべて書き出す。
// out/ は毎回消してから作る。GitHub Pages は out/ をそのまま配信する。
//
// out/
//   index.html               記事一覧
//   posts/<slug>/index.html  記事
//   404.html、404/index.html ページが見つからないとき（GitHub Pages は 404.html を返す）
//   feed.xml、sitemap.xml、robots.txt
//   assets/site.css          shared/ と src/ の CSS を 1 本にしたもの（src/css.ts）
//   assets/site.js           src/client.js
//   assets/marp-browser.js   marp-core の browser script（Marp の記事だけが読む）
//   images/<slug>/…          content/images/ のうち、公開した記事から参照されている画像
//   public/ の中身           favicon.ico、icon.svg、apple-icon.png、opengraph-image.png

import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { buildCss } from "./css.ts";
import { buildAtomFeed, buildRobots, buildSitemap } from "./feed.ts";
import { homePage, notFoundPage, postPage, type PageContext } from "./html.ts";
import { imageReferences } from "./images.ts";
import { CONTENT_DIRECTORY, IMAGES_DIRECTORY_NAME, loadPosts, POSTS_DIRECTORY_NAME } from "./posts.ts";
import { HOME_PATH, postPath } from "./site.ts";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "out");
const contentDir = path.join(root, CONTENT_DIRECTORY);

function main(): void {
  const now = new Date();
  const posts = loadPosts(contentDir, now);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(path.join(root, "public"), outDir, { recursive: true });

  const assets = {
    css: writeAsset("site.css", buildCss(root)),
    script: writeAsset("site.js", readFileSync(path.join(root, "src", "client.js"), "utf8")),
    marpScript: writeAsset("marp-browser.js", marpBrowserScript()),
  };
  const ctx: PageContext = { assets, now };

  writePage(HOME_PATH, homePage(posts, ctx));
  for (const post of posts) writePage(postPath(post.slug), postPage(post, ctx));
  const notFound = notFoundPage(ctx);
  writeFileSync(path.join(outDir, "404.html"), notFound);
  writePage("/404/", notFound);

  writeFileSync(path.join(outDir, "feed.xml"), buildAtomFeed(posts, now));
  writeFileSync(path.join(outDir, "sitemap.xml"), buildSitemap(posts));
  writeFileSync(path.join(outDir, "robots.txt"), buildRobots());

  const images = copyImages(posts.map((post) => post.slug));
  console.log(`out/ に記事 ${posts.length} 件のページと、画像 ${images} 枚を書き出しました`);
}

/** out/assets/<name> に書き、中身のハッシュを ?v= に付けた URL を返す。ハッシュは更新時にブラウザのキャッシュを使わないため */
function writeAsset(name: string, content: string): string {
  const dir = path.join(outDir, "assets");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), content);

  const hash = createHash("sha256").update(content).digest("hex").slice(0, 12);

  return `/assets/${name}?v=${hash}`;
}

/** サイト内のパス（末尾は /）を out/<パス>/index.html に書く */
function writePage(urlPath: string, html: string): void {
  const dir = path.join(outDir, ...decodeURIComponent(urlPath).split("/").filter(Boolean));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.html"), html);
}

/**
 * marp-core の browser script（読み込むと document の中のスライドに文字の自動縮小などを当てる IIFE）。
 * map は出力しない。そのため source map の参照を外す
 */
function marpBrowserScript(): string {
  const require = createRequire(import.meta.url);
  const dir = path.dirname(require.resolve("@marp-team/marp-core/package.json"));
  return readFileSync(path.join(dir, "lib", "browser-iife.iife.js"), "utf8").replace(/\n\/\/# sourceMappingURL=.*\s*$/, "\n");
}

/**
 * content/images/ のうち、公開した記事の本文から参照されている画像だけを out/images/ にコピーする。
 * 参照の拾い方は src/images.ts の imageReferences。参照先のファイルが無いものは警告だけ出す（ビルドは止めない）
 */
function copyImages(slugs: readonly string[]): number {
  let copied = 0;
  for (const key of referencedImages(slugs)) {
    const source = path.join(contentDir, IMAGES_DIRECTORY_NAME, ...key.split("/"));
    if (!existsSync(source)) {
      console.warn(`記事が参照する画像が content/images/ にありません: ${key}`);
      continue;
    }

    const target = path.join(outDir, IMAGES_DIRECTORY_NAME, ...key.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target);
    copied++;
  }

  return copied;
}

/** 記事の本文が参照する画像の "<slug>/<ファイル名>"（重複なし） */
function referencedImages(slugs: readonly string[]): Set<string> {
  const keys = new Set<string>();
  for (const slug of slugs) {
    const text = readFileSync(path.join(contentDir, POSTS_DIRECTORY_NAME, `${slug}.md`), "utf8");
    for (const key of imageReferences(text)) keys.add(key);
  }

  return keys;
}

main();
