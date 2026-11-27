// サイトの CSS を 1 本にまとめる。portfolio とブログで共有する（結合する CSS の一覧は、サイトごとに引数で渡す）。
// CSS は CSS Modules の形式のまま置く。ビルド時に class 名を「名前_class」（例：PostList.module.css の .title → .PostList_title）に
// 書き換えてから結合する。HTML 側は classOf（と cls・classList）で同じ名前を引く。globals.css は書き換えずに先頭に置く。
//
// 書き換えるのはセレクタの中の .class だけ。宣言ブロック（入れ子のない最内の {…}）、@ 規則の前置き、コメント、
// 文字列、属性セレクタ（[…]）の中は触らない。:global(…) は中身をそのまま残して外側を外す。
// 次の書き方があればビルドを止める。
// - :global の括弧なし、:local、composes、@keyframes
// - 英字か _ で始まらない class 名（.--x など）
// 次の書き方は扱えない。検査はしない。
// - 閉じていないコメント（読み飛ばさず、中の .xxx も書き換える）
// - CSS のネストで、入れ子の規則と同じブロックに並べた宣言（宣言の中の .xxx も書き換える）

import { readFileSync } from "node:fs";
import path from "node:path";

import { attr } from "./html.ts";

/**
 * 結合する CSS。パスは buildCss の root からの相対。サイトごとに違うので、引数で受ける。
 * moduleFiles は、結合のときの名前（classOf の第 1 引数）→ ファイル。globalFile の後ろに、この順で結合する
 * （class 名は名前ごとに別のため、順は見た目に影響しない）。
 * 2 つのサイトで共有している CSS の名前（layout・SiteHeader など）は、2 つのサイトで同じにする
 */
export type CssFiles = { globalFile: string; moduleFiles: Readonly<Record<string, string>> };

const COMMENT = String.raw`/\*[\s\S]*?\*/`;
const STRING = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'`;

/** 前から順に、読み飛ばすもの（コメント、文字列、宣言ブロック、[…]、@ 規則の前置き）と、書き換えるもの（:global(…)、.class） */
const SELECTOR_TOKEN = new RegExp(
  [
    COMMENT,
    STRING,
    String.raw`\{(?:${COMMENT}|${STRING}|[^{}"'/]|/(?!\*))*\}`,
    String.raw`\[(?:${STRING}|[^\]"'])*\]`,
    String.raw`@[^{;]*`,
    String.raw`:global\(((?:[^()]|\([^()]*\))*)\)`,
    String.raw`\.([A-Za-z_-][\w-]*)`,
  ].join("|"),
  "g",
);

/** 書き換えられる class 名の先頭（- は 1 つまで） */
const CLASS_NAME_START = /^-?[A-Za-z_]/;

const UNSUPPORTED = /@keyframes|\bcomposes\s*:|:local\b|:global(?!\()/;

/** 名前ごとの、書き換え前の class 名 → 書き換え後の class 名 */
const classMap = new Map<string, Map<string, string>>();

/** classOf で引いて CSS に無かった "名前.class"。各サイトのビルドが、CSS に無い class を見つけてビルドを止めるのに使う */
const missingClasses = new Set<string>();

/**
 * 結合した CSS を返す。見出しのコメントには、渡したパスの文字列をそのまま入れる。
 * 呼んだ後は classOf で class 名を引ける。
 */
export function buildCss(root: string, { globalFile, moduleFiles }: CssFiles): string {
  const parts = [readFileSync(path.join(root, globalFile), "utf8")];
  for (const [name, file] of Object.entries(moduleFiles)) {
    const css = readFileSync(path.join(root, file), "utf8");
    parts.push(`/* ${file} */\n${scopeModule(css, name, file)}`);
  }

  return parts.join("\n");
}

/** module の対応表。buildCss の前に引いたときと、渡した一覧に無い名前を引いたときは例外を投げる */
function classesOf(module: string): Map<string, string> {
  const classes = classMap.get(module);
  if (classes !== undefined) return classes;

  if (classMap.size === 0) throw new Error(`buildCss を呼ぶ前に、${module} の class 名を引いています`);
  throw new Error(`${module} は、buildCss に渡した CSS の一覧にありません（名前の書き間違いか、一覧への足し忘れ）`);
}

/**
 * CSS Modules と同じく、CSS に無い class 名は undefined（class 属性を出さない）。
 * 無かったものは missingClassNames で返す。buildCss を呼んだ後に使う
 */
export function classOf(module: string, name: string): string | undefined {
  const classes = classesOf(module);

  const scoped = classes.get(name);
  if (scoped === undefined) missingClasses.add(`${module}.${name}`);

  return scoped;
}

/** これまでに classOf で引いて CSS に無かった "名前.class"（例 "PostList.main"）の一覧 */
export function missingClassNames(): string[] {
  return [...missingClasses].sort();
}

/**
 * ブラウザで描く画面に渡す、書き換え前の class 名 → 書き換え後の class 名の対応表。
 * names のうち CSS に無いものがあれば例外を投げる（ブラウザ側では、CSS に無い class を検出できないため）
 */
export function pickClasses<Name extends string>(module: string, names: readonly Name[]): Record<Name, string> {
  const classes = classesOf(module);

  const missing = names.filter((name) => classes.get(name) === undefined);
  if (missing.length > 0) throw new Error(`${module} の CSS に無い class があります: ${missing.join("、")}`);

  return Object.fromEntries(names.map((name) => [name, classOf(module, name)])) as Record<Name, string>;
}

/** class 属性（先頭に空白を付ける。CSS に無い class なら出さない） */
export function cls(module: string, name: string): string {
  return attr("class", classOf(module, name));
}

/** 複数の class をまとめた class 属性の値（CSS に無い class は外す。1 つも無ければ undefined） */
export function classList(...names: readonly [string, string][]): string | undefined {
  const classes = names.map(([module, name]) => classOf(module, name)).filter((name) => name !== undefined);

  return classes.length === 0 ? undefined : classes.join(" ");
}

/** 1 ファイル分の class を prefix_class に書き換え、書き換えた class を classMap に入れる */
function scopeModule(css: string, prefix: string, file: string): string {
  if (UNSUPPORTED.test(css.replace(new RegExp(COMMENT, "g"), ""))) {
    throw new Error(`${file}: ここでは扱えない CSS Modules の書き方（@keyframes、composes、:local、括弧なしの :global）があります`);
  }

  const classes = new Map<string, string>();
  classMap.set(prefix, classes);

  return css.replace(
    SELECTOR_TOKEN,
    (token: string, globalBody: string | undefined, className: string | undefined, offset: number) => {
      if (globalBody !== undefined) return globalBody;
      if (className === undefined) return token;
      if (!CLASS_NAME_START.test(className)) {
        throw new Error(`セレクタの class 名を読めません: ${selectorAt(css, offset)}`);
      }

      const scoped = `${prefix}_${className}`;
      classes.set(className, scoped);

      return `.${scoped}`;
    },
  );
}

/** offset を含むセレクタ（直前の { } ; から次の { まで） */
function selectorAt(css: string, offset: number): string {
  const begin = Math.max(css.lastIndexOf("{", offset), css.lastIndexOf("}", offset), css.lastIndexOf(";", offset)) + 1;
  const end = css.indexOf("{", offset);

  return css.slice(begin, end < 0 ? css.length : end).trim();
}
