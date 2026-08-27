// out/ に書き出したページが読み込むサイト内のファイルが、out/ にあるかを確かめる（checkSiteResources）。
// 書き出した HTML を読み直して参照先を拾う。src/build.ts が書き出しの最後に呼ぶ。

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { IMAGES_DIRECTORY_NAME } from "./posts.ts";
import { SITE_URL } from "./site.ts";

/** href のうち、画像へのリンクとして確かめるものの接頭辞（本文の [図](/images/<slug>/x.webp) など） */
const IMAGE_LINK_PREFIX = `/${IMAGES_DIRECTORY_NAME}/`;

/** siteFileOf が返す、out/ の中のファイルとして扱えない src の印（どのファイルにも一致しない） */
const INVALID_SITE_FILE = "";

const HTML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/**
 * out/ の HTML が読み込むサイト内のファイル（<img src>、/images/ で始まる href、style 属性・<style> の中の url(…)）が
 * out/ にあるかを確かめ、無いものがあれば、まとめて例外を投げる。
 * imageReferences が拾えない書き方（先頭の / が無い、?v= 付き、/images/ の綴り違い、サブディレクトリ）で画像を参照すると、
 * 画像はコピーされずにページだけが出るため。外部の URL、data:、#… は確かめない。
 * srcset、<source>、<video poster> は見ない（記事の Markdown からは出ない）。outDir は out/ の絶対パス
 */
export function checkSiteResources(outDir: string): void {
  const problems: string[] = [];
  for (const file of htmlFiles(outDir)) {
    const html = readFileSync(file, "utf8");
    const pageUrl = new URL(pageUrlPath(file, outDir), SITE_URL);
    for (const src of resourceUrls(html)) {
      const target = siteFileOf(src, pageUrl, outDir);
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
function siteFileOf(src: string, pageUrl: URL, outDir: string): string | undefined {
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

/** out/ の中の HTML ファイルのサイト内のパス（out/posts/a/index.html → /posts/a/） */
function pageUrlPath(file: string, outDir: string): string {
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
