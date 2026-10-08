// 記事本文の Markdown を、サニタイズ済みの HTML 文字列に変換する。
// ビルド時に Server Component からだけ呼ぶ（変換ライブラリをクライアントのバンドルに入れない）。

import type { Element, Root } from "hast";
import rehypeSanitize, { type Options as SanitizeSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

const tableCellAlign: [string, ...string[]] = ["align", "left", "center", "right"];

/**
 * 許可リスト。ここに無いタグは子要素だけ残して外し、無い属性は取り除く。
 * id と name は許可しないので、ページ内の要素を上書き（DOM clobbering）されることもない。
 * h1 はページのタイトル専用なので許可しない（本文の見出しは rehypeShiftHeadings で h2 以下になる）。
 */
export const sanitizeSchema: SanitizeSchema = {
  tagNames: [
    "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr",
    "strong", "em", "del",
    "blockquote",
    "ul", "ol", "li",
    "pre", "code",
    "a", "img",
    "table", "thead", "tbody", "tr", "th", "td",
  ],
  attributes: {
    a: ["href", "title"],
    img: ["src", "alt", "title"],
    // コードブロックの言語名（```ts → class="language-ts"）だけ残す
    code: [["className", /^language-[\w-]+$/]],
    ol: ["start"],
    th: [tableCellAlign],
    td: [tableCellAlign],
  },
  // これ以外のスキーム（javascript:、data: など）の URL は属性ごと取り除く。相対 URL は残る
  protocols: {
    href: ["http", "https", "mailto"],
    src: ["http", "https"],
  },
  ancestors: {
    li: ["ol", "ul"],
    thead: ["table"],
    tbody: ["table"],
    tr: ["table"],
    th: ["table"],
    td: ["table"],
  },
  // 子要素ごと取り除く（中身のテキストも残さない）
  strip: ["script", "style"],
  clobber: [],
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  // allowDangerousHtml を有効にしないので、Markdown 中の生の HTML はここで捨てられる
  .use(remarkRehype)
  .use(rehypeShiftHeadings)
  .use(rehypeSanitize, sanitizeSchema)
  // サニタイズの後に付ける（許可リストに rel や loading を入れずに済む）
  .use(rehypeDecorateElements)
  .use(rehypeStringify)
  .freeze();

export function renderMarkdown(markdown: string): string {
  return String(processor.processSync(markdown));
}

/** 目次の 1 項目。id は本文の h2 に付けた id */
export type Heading = { id: string; text: string };

/**
 * renderMarkdown と同じ変換をし、本文の h2 に id を付けて目次の項目と一緒に返す。
 * id はこちらで決めた連番（section-1, section-2, …）にする。見出しの文字から作らないので、
 * 記事の書き方で既存の id と衝突したり、ページ内の要素を上書きしたりしない。
 */
export function renderMarkdownWithHeadings(markdown: string): { html: string; headings: Heading[] } {
  const tree = processor.runSync(processor.parse(markdown));
  const headings: Heading[] = [];
  forEachElement(tree, (element) => {
    if (element.tagName !== "h2") return;
    const id = `section-${headings.length + 1}`;
    element.properties.id = id;
    headings.push({ id, text: textContent(element) });
  });
  return { html: processor.stringify(tree), headings };
}

/** hast の木を許可リストでサニタイズする。生の HTML が木に入ってきた場合の防御を単体で確認するために公開している。 */
export function sanitizeTree(tree: Root): Root {
  return unified().use(rehypeSanitize, sanitizeSchema).runSync(tree);
}

// 本文の見出しを1段下げる（# → h2、## → h3、…）。h6 はそれ以上下げられないので h6 のまま
function rehypeShiftHeadings() {
  return (tree: Root) => {
    forEachElement(tree, (element) => {
      const match = /^h([1-6])$/.exec(element.tagName);
      if (match) element.tagName = `h${Math.min(Number(match[1]) + 1, 6)}`;
    });
  };
}

// サニタイズ済みの要素に、こちらで決めた安全な属性だけを足す
function rehypeDecorateElements() {
  return (tree: Root) => {
    forEachElement(tree, (element) => {
      if (element.tagName === "a" && isExternalUrl(element.properties.href)) {
        element.properties.rel = ["noopener", "noreferrer"];
      }
      if (element.tagName === "img") {
        element.properties.loading = "lazy";
        element.properties.decoding = "async";
      }
    });
  };
}

function forEachElement(node: Root | Element, callback: (element: Element) => void): void {
  for (const child of node.children) {
    if (child.type !== "element") continue;
    callback(child);
    forEachElement(child, callback);
  }
}

function textContent(node: Element): string {
  return node.children
    .map((child) => (child.type === "text" ? child.value : child.type === "element" ? textContent(child) : ""))
    .join("");
}

// http(s):// とスキーム省略の //host/ を外部リンクとして扱う
function isExternalUrl(href: unknown): boolean {
  return typeof href === "string" && /^(https?:)?\/\//i.test(href);
}
