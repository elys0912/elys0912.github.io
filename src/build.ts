// サイトのビルド（npm run build → node src/build.ts）。content/ を読み、out/ に静的なファイルをすべて書き出す。
// out/ は毎回消してから作る。GitHub Pages は out/ をそのまま配信する。
//
// out/
//   index.html               記事一覧
//   posts/<slug>/index.html  記事
//   archive/<yyyy>/<mm>/index.html  月別の記事一覧（記事のある月だけ）
//   tags/index.html          タグの一覧（タグが無くても書く。ナビから案内するため）
//   tags/<タグ>/index.html   タグごとの記事一覧（ディレクトリ名はタグの文字のまま）
//   404.html、404/index.html ページが見つからないとき（GitHub Pages は 404.html を返す）
//   feed.xml、sitemap.xml、robots.txt
//   assets/site.css          shared/ と src/ の CSS を 1 本にしたもの（src/css.ts）
//   assets/site.js           src/client.js
//   assets/marp-browser.js   marp-core の browser script（Marp の記事だけが読む）
//   images/<slug>/…          content/images/ のうち、公開した記事から参照されている画像
//   public/ の中身           favicon.ico、icon.svg、apple-icon.png、opengraph-image.png
//
// 書き出した後、ページが読み込むサイト内の画像（<img src>、/images/ で始まる href、style の url(…)）が out/ にあるかを確かめる
// （checkSiteResources）。src/html.ts が引いた class が CSS にあるかも確かめる（checkMissingClasses）。

import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { groupPostsByMonth } from "./archive.ts";
import { buildCss, missingClassNames } from "./css.ts";
import { buildAtomFeed, buildRobots, buildSitemap } from "./feed.ts";
import { archivePage, homePage, notFoundPage, postPage, tagIndexPage, tagPage, type PageContext } from "./html.ts";
import { imageReferences } from "./images.ts";
import { CONTENT_DIRECTORY, IMAGES_DIRECTORY_NAME, loadPosts, POSTS_DIRECTORY_NAME } from "./posts.ts";
import { archivePath, HOME_PATH, postPath, SITE_URL, TAG_INDEX_PATH, tagPath } from "./site.ts";
import { groupPostsByTag } from "./tags.ts";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "out");
const contentDir = path.join(root, CONTENT_DIRECTORY);

/**
 * src/html.ts が引くが、意図して CSS に無い class（"ファイル名.class"）。
 * PostList.main は portfolio のコンポーネントと同じ構造にするために引くが、共有の CSS に定義が無い
 */
const EXPECTED_MISSING_CLASSES: ReadonlySet<string> = new Set(["PostList.main"]);

/** 記事が 0 件でもビルドを通すときに "1" にする環境変数。記事の移動・削除の誤りで、空のサイトを公開しないため */
const ALLOW_NO_POSTS_ENV = "BLOG_ALLOW_NO_POSTS";

function main(): void {
  const now = new Date();
  const posts = loadPosts(contentDir, now);
  if (posts.length === 0 && process.env[ALLOW_NO_POSTS_ENV] !== "1") {
    throw new Error(
      `${CONTENT_DIRECTORY}/${POSTS_DIRECTORY_NAME}/ に公開する記事が 1 件もありません。意図して 0 件にするときは ${ALLOW_NO_POSTS_ENV}=1 を付けて実行する`,
    );
  }

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
  for (const post of posts) writePage(postPath(post.slug), postPage(post, posts, ctx));
  for (const archive of groupPostsByMonth(posts)) writePage(archivePath(archive.month), archivePage(archive, posts, ctx));
  writePage(TAG_INDEX_PATH, tagIndexPage(posts, ctx));
  for (const archive of groupPostsByTag(posts)) writePage(tagPath(archive.tag), tagPage(archive, posts, ctx));
  const notFound = notFoundPage(ctx);
  writeFileSync(path.join(outDir, "404.html"), notFound);
  writePage("/404/", notFound);

  writeFileSync(path.join(outDir, "feed.xml"), buildAtomFeed(posts, now));
  writeFileSync(path.join(outDir, "sitemap.xml"), buildSitemap(posts));
  writeFileSync(path.join(outDir, "robots.txt"), buildRobots());

  const images = copyImages(posts.map((post) => post.slug));
  checkSiteResources();
  checkMissingClasses();
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
 * 参照の拾い方は src/images.ts の imageReferences。参照先のファイルが無いものがあれば、まとめて例外を投げる
 */
function copyImages(slugs: readonly string[]): number {
  const missing: string[] = [];
  let copied = 0;
  for (const key of referencedImages(slugs)) {
    const source = path.join(contentDir, IMAGES_DIRECTORY_NAME, ...key.split("/"));
    if (!existsSync(source)) {
      missing.push(key);
      continue;
    }

    const target = path.join(outDir, IMAGES_DIRECTORY_NAME, ...key.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target);
    copied++;
  }

  if (missing.length > 0) {
    const list = missing.map((key) => `  - ${key}`).join("\n");
    throw new Error(`記事が参照する画像が ${CONTENT_DIRECTORY}/${IMAGES_DIRECTORY_NAME}/ にありません:\n${list}`);
  }

  return copied;
}

/**
 * out/ の HTML が読み込むサイト内のファイル（<img src>、/images/ で始まる href、style 属性・<style> の中の url(…)）が
 * out/ にあるかを確かめ、無いものがあれば、まとめて例外を投げる。
 * imageReferences が拾えない書き方（先頭の / が無い、?v= 付き、/images/ の綴り違い、サブディレクトリ）で画像を参照すると、
 * 画像はコピーされずにページだけが出るため。外部の URL、data:、#… は確かめない。
 * srcset、<source>、<video poster> は見ない（記事の Markdown からは出ない）
 */
function checkSiteResources(): void {
  const problems: string[] = [];
  for (const file of htmlFiles(outDir)) {
    const html = readFileSync(file, "utf8");
    const pageUrl = new URL(pageUrlPath(file), SITE_URL);
    for (const src of resourceUrls(html)) {
      const target = siteFileOf(src, pageUrl);
      if (target !== undefined && !isFile(target)) {
        problems.push(`${path.relative(outDir, file).replaceAll(path.sep, "/")}: ${src}`);
      }
    }
  }

  if (problems.length > 0) {
    const list = [...new Set(problems)].map((problem) => `  - ${problem}`).join("\n");
    throw new Error(
      `ページが読み込むファイルが out/ にありません（画像は /${IMAGES_DIRECTORY_NAME}/<slug>/<ファイル名> の形で参照する）:\n${list}`,
    );
  }
}

/**
 * src/html.ts が classOf で引いた class のうち、CSS に無く、EXPECTED_MISSING_CLASSES にも無いものがあれば例外を投げる。
 * CSS に無い class は属性ごと消えるため、portfolio からの同期で共有の CSS の class 名が変わると、見た目だけが黙って崩れる
 */
function checkMissingClasses(): void {
  const unexpected = missingClassNames().filter((name) => !EXPECTED_MISSING_CLASSES.has(name));
  if (unexpected.length === 0) return;

  const list = unexpected.map((name) => `  - ${name}`).join("\n");
  throw new Error(
    `src/html.ts が引く class が CSS にありません（共有の CSS の class 名が変わったなら src/html.ts を合わせる。意図して無いものは src/build.ts の EXPECTED_MISSING_CLASSES に足す）:\n${list}`,
  );
}

/** href のうち、画像へのリンクとして確かめるものの接頭辞（本文の [図](/images/<slug>/x.webp) など） */
const IMAGE_LINK_PREFIX = `/${IMAGES_DIRECTORY_NAME}/`;

/** HTML の中の <img src>、/images/ で始まる href、style 属性・<style> の中の url(…)。HTML の文字参照は戻す */
function resourceUrls(html: string): string[] {
  const urls: string[] = [];
  const styles: string[] = [];
  // 本文の中の < は文字参照になっているため、開始タグとして読むのは本物のタグだけ
  for (const tag of html.matchAll(/<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g)) {
    const [, name, attrs] = tag;
    for (const attr of attrs.matchAll(/\s([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
      const attrName = attr[1].toLowerCase();
      const value = decodeHtmlEntities(attr[2] ?? attr[3] ?? attr[4] ?? "");
      if (name.toLowerCase() === "img" && attrName === "src") urls.push(value);
      if (attrName === "href" && value.trim().startsWith(IMAGE_LINK_PREFIX)) urls.push(value);
      if (attrName === "style") styles.push(value);
    }
  }
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) styles.push(match[1]);

  for (const style of styles) {
    for (const match of style.matchAll(/\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) {
      urls.push(match[1] ?? match[2] ?? match[3]);
    }
  }

  return urls.map((url) => url.trim()).filter((url) => url !== "");
}

/** src がサイト内のファイルを指すなら out/ の中のパス。外部の URL、data:、#… は undefined */
function siteFileOf(src: string, pageUrl: URL): string | undefined {
  if (src.startsWith("#") || /^data:/i.test(src)) return undefined;

  let url: URL;
  try {
    url = new URL(src, pageUrl);
  } catch {
    return undefined;
  }
  if (url.origin !== SITE_URL.origin) return undefined;

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    // デコードできない %… は配信されるファイルを指さない
    return INVALID_SITE_FILE;
  }
  const segments = pathname.split("/").filter(Boolean);
  // %5C のように、デコードした後で区切りや上の階層になるものは out/ の外を指しうるので、無いものとして扱う
  if (segments.some((segment) => segment === "." || segment === ".." || segment.includes("\\"))) return INVALID_SITE_FILE;

  return pathname.endsWith("/") ? path.join(outDir, ...segments, "index.html") : path.join(outDir, ...segments);
}

/** siteFileOf が返す、out/ の中のファイルとして扱えない src の印（どのファイルにも一致しない） */
const INVALID_SITE_FILE = "";

/** out/ の中の HTML ファイルのサイト内のパス（out/posts/a/index.html → /posts/a/） */
function pageUrlPath(file: string): string {
  const relative = path.relative(outDir, file).split(path.sep).map(encodeURIComponent).join("/");

  return `/${relative.replace(/(^|\/)index\.html$/, "$1")}`;
}

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".html"))
    .map((name) => path.join(dir, name));
}

function isFile(file: string): boolean {
  return existsSync(file) && statSync(file).isFile();
}

const HTML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** 属性値の文字参照（&quot; &#x26; &#39; など）を戻す */
function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity: string, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return HTML_ENTITIES[body.toLowerCase()] ?? entity;
  });
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
