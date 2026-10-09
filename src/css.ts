// サイトの CSS を 1 本にまとめる。
// shared/ の CSS は portfolio（Next.js）の CSS Modules のまま届くので、ビルド時に class 名を「ファイル名_class」
// （例：PostList.module.css の .title → .PostList_title）に書き換えてから結合する。HTML 側は classOf で同じ名前を引く。
// globals.css は書き換えずに先頭に置く。
//
// 書き換えるのはセレクタ（@ で始まらない規則の { の前）の中の .class だけ。宣言（0.5rem、url(…) など）、コメント、
// 文字列、属性セレクタ（[…]）の中は触らない。:global(…) は中身をそのまま残して外側を外す。
// CSS Modules のうち、ここで扱えない書き方（:global の括弧なし、:local、composes、@keyframes）があればビルドを止める。

import { readFileSync } from "node:fs";
import path from "node:path";

/** globals.css の後ろに、この順で結合する（class 名はファイルごとに別なので、順は見た目に効かない） */
const MODULE_FILES = [
  "shared/app/layout.module.css",
  "shared/components/SiteHeader.module.css",
  "shared/components/SiteFooter.module.css",
  "src/FooterBackButton.module.css",
  "shared/components/PostList.module.css",
  "shared/components/PostDetail.module.css",
  "shared/components/TableOfContents.module.css",
  "shared/components/MarpDeck.module.css",
] as const;
const GLOBAL_FILE = "shared/app/globals.css";

/** CSS Modules のファイル名（.module.css を除いたもの）。classOf の第 1 引数 */
export type ModuleName =
  | "layout"
  | "SiteHeader"
  | "SiteFooter"
  | "FooterBackButton"
  | "PostList"
  | "PostDetail"
  | "TableOfContents"
  | "MarpDeck";

/** ファイル名ごとの、書き換え前の class 名 → 書き換え後の class 名 */
const classMap = new Map<string, Map<string, string>>();

/**
 * 結合した CSS を返す。root はリポジトリのルート。
 * 呼んだ後は classOf で class 名を引ける。
 */
export function buildCss(root: string): string {
  const parts = [readFileSync(path.join(root, GLOBAL_FILE), "utf8")];
  for (const file of MODULE_FILES) {
    const name = path.basename(file, ".module.css");
    const classes = new Map<string, string>();
    classMap.set(name, classes);
    parts.push(`/* ${file} */\n${scopeModule(readFileSync(path.join(root, file), "utf8"), name, classes, file)}`);
  }
  return parts.join("\n");
}

/**
 * CSS Modules と同じく、CSS に無い class 名は undefined（Next.js では class 属性が出ない）。
 * buildCss を呼んだ後に使う
 */
export function classOf(module: ModuleName, name: string): string | undefined {
  const classes = classMap.get(module);
  if (!classes) throw new Error(`${module}.module.css を読む前に class 名を引いています`);
  return classes.get(name);
}

/** 1 ファイル分の class を prefix_class に書き換える。書き換えた class を classes に入れる */
function scopeModule(css: string, prefix: string, classes: Map<string, string>, file: string): string {
  if (/@keyframes|\bcomposes\s*:|:local\b|:global(?!\()/.test(stripComments(css))) {
    throw new Error(`${file}: ここでは扱えない CSS Modules の書き方（@keyframes、composes、:local、括弧なしの :global）があります`);
  }
  let out = "";
  // 直前の { } ; から次の { までの文字列（規則のセレクタ、または宣言）
  let pending = "";
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      const stop = end < 0 ? css.length : end + 2;
      // コメントは書き換えない（セレクタの途中のものは scopeSelector が飛ばす）
      const comment = css.slice(i, stop);
      if (pending.trim() === "") {
        out += pending + comment;
        pending = "";
      } else {
        pending += comment;
      }
      i = stop - 1;
    } else if (c === '"' || c === "'") {
      const end = endOfString(css, i);
      pending += css.slice(i, end + 1);
      i = end;
    } else if (c === "{") {
      out += (pending.trimStart().startsWith("@") ? pending : scopeSelector(pending, prefix, classes)) + c;
      pending = "";
    } else if (c === "}" || c === ";") {
      out += pending + c;
      pending = "";
    } else {
      pending += c;
    }
  }
  return out + pending;
}

/** セレクタの .class を書き換える。文字列、[…]、コメントの中は触らない。:global(…) は中身だけ残す */
function scopeSelector(selector: string, prefix: string, classes: Map<string, string>): string {
  let out = "";
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === '"' || c === "'") {
      const end = endOfString(selector, i);
      out += selector.slice(i, end + 1);
      i = end;
    } else if (c === "/" && selector[i + 1] === "*") {
      const end = selector.indexOf("*/", i + 2);
      const stop = end < 0 ? selector.length : end + 2;
      out += selector.slice(i, stop);
      i = stop - 1;
    } else if (c === "[") {
      const end = endOfBracket(selector, i, "[", "]");
      out += selector.slice(i, end + 1);
      i = end;
    } else if (selector.startsWith(":global(", i)) {
      const open = i + ":global".length;
      const end = endOfBracket(selector, open, "(", ")");
      out += selector.slice(open + 1, end);
      i = end;
    } else if (c === "." && /[A-Za-z_-]/.test(selector[i + 1] ?? "")) {
      const name = /^-?[A-Za-z_][\w-]*/.exec(selector.slice(i + 1))?.[0];
      if (name === undefined) throw new Error(`セレクタの class 名を読めません: ${selector.trim()}`);
      const scoped = `${prefix}_${name}`;
      classes.set(name, scoped);
      out += `.${scoped}`;
      i += name.length;
    } else {
      out += c;
    }
  }
  return out;
}

/** start の引用符を閉じる引用符の位置（\ のエスケープを飛ばす）。閉じていなければ末尾 */
function endOfString(text: string, start: number): number {
  const quote = text[start];
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === quote) return i;
  }
  return text.length - 1;
}

/** start の開き括弧に対応する閉じ括弧の位置（入れ子と文字列を数える）。閉じていなければ例外 */
function endOfBracket(text: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") i = endOfString(text, i);
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return i;
  }
  throw new Error(`セレクタの ${open} が閉じていません: ${text.trim()}`);
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}
