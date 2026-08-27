// out/ に書き出したページが読み込むサイト内のファイルが、out/ にあるかを確かめる（checkSiteResources）。
// 書き出した HTML を読み直して参照先を拾う。src/build.ts が書き出しの最後に呼ぶ。

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { IMAGES_DIRECTORY_NAME } from "./posts.ts";
import { SITE_URL } from "./site.ts";

/** href のうち、画像へのリンクとして確かめるものの接頭辞（本文の [図](/images/<slug>/x.webp) など） */
const IMAGE_LINK_PREFIX = `/${IMAGES_DIRECTORY_NAME}/`;

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
      if (target.kind === "external") continue;

      const exists = target.kind === "file" && isFile(target.path);
      if (!exists) {
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
  const attributes = tagAttributes(html);
  const linkedUrls = attributes.filter(isResourceLink).map((attribute) => attribute.value);
  const styles = [
    ...attributes.filter((attribute) => attribute.name === "style").map((attribute) => attribute.value),
    ...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]),
  ];
  const urls = [...linkedUrls, ...styles.flatMap(styleUrls)];

  return urls.map((url) => url.trim()).filter((url) => url !== "");
}

/** 開始タグの属性 1 つ分。tagName と name は小文字、value は文字参照を戻した値 */
type TagAttribute = { tagName: string; name: string; value: string };

/** HTML の開始タグの属性を、出てきた順に並べる */
function tagAttributes(html: string): TagAttribute[] {
  const attributes: TagAttribute[] = [];
  // 本文の中の < は文字参照になっているため、開始タグとして読むのは本物のタグだけ
  for (const tag of html.matchAll(/<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g)) {
    const [, tagName, attrs] = tag;
    for (const attr of attrs.matchAll(/\s([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
      const value = decodeHtmlEntities(attr[2] ?? attr[3] ?? attr[4] ?? "");
      attributes.push({ tagName: tagName.toLowerCase(), name: attr[1].toLowerCase(), value });
    }
  }

  return attributes;
}

/** ファイルを読み込む属性か（<img src> と、/images/ で始まる href） */
function isResourceLink({ tagName, name, value }: TagAttribute): boolean {
  if (tagName === "img" && name === "src") return true;

  return name === "href" && value.trim().startsWith(IMAGE_LINK_PREFIX);
}

/** CSS の中の url(…) */
function styleUrls(style: string): string[] {
  return [...style.matchAll(/\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)].map((match) => match[1] ?? match[2] ?? match[3]);
}

/**
 * siteFileOf の結果。external は確かめないもの（外部の URL、data:、#…）。
 * invalid は out/ の中のファイルとして扱えないもの（どのファイルにも一致せず、無いものとして扱う）。file は out/ の中のパス
 */
type SiteFile = { kind: "external" } | { kind: "invalid" } | { kind: "file"; path: string };

/** src が指す、out/ の中のファイル */
function siteFileOf(src: string, pageUrl: URL, outDir: string): SiteFile {
  if (src.startsWith("#") || /^data:/i.test(src)) return { kind: "external" };

  let url: URL;
  try {
    url = new URL(src, pageUrl);
  } catch {
    return { kind: "external" };
  }
  if (url.origin !== SITE_URL.origin) return { kind: "external" };

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    // デコードできない %… は配信されるファイルを指さない
    return { kind: "invalid" };
  }
  const segments = pathname.split("/").filter(Boolean);
  // %5C のように、デコードした後で区切りや上の階層になるものは out/ の外を指しうるので、無いものとして扱う
  if (segments.some((segment) => segment === "." || segment === ".." || segment.includes("\\"))) return { kind: "invalid" };

  const file = pathname.endsWith("/") ? path.join(outDir, ...segments, "index.html") : path.join(outDir, ...segments);

  return { kind: "file", path: file };
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
