// サイトの CSS を 1 本にまとめる。
// shared/ の CSS は portfolio（Next.js）の CSS Modules の形式のまま届く。そのため、ビルド時に class 名を
// 「ファイル名_class」（例：PostList.module.css の .title → .PostList_title）に書き換えてから結合する。
// HTML 側は classOf で同じ名前を引く。globals.css は書き換えずに先頭に置く。
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

/**
 * CSS Modules のファイル名（.module.css を除いたもの。classOf の第 1 引数）→ ファイル。
 * globals.css の後ろに、この順で結合する（class 名はファイルごとに別のため、順は見た目に影響しない）
 */
const MODULE_FILES = {
  layout: "shared/app/layout.module.css",
  SiteHeader: "shared/components/SiteHeader.module.css",
  SiteFooter: "shared/components/SiteFooter.module.css",
  FooterBackButton: "src/FooterBackButton.module.css",
  PostList: "shared/components/PostList.module.css",
  PostDetail: "shared/components/PostDetail.module.css",
  TableOfContents: "shared/components/TableOfContents.module.css",
  MarpDeck: "shared/components/MarpDeck.module.css",
} as const;

export type ModuleName = keyof typeof MODULE_FILES;

const GLOBAL_FILE = "shared/app/globals.css";

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

/** ファイル名ごとの、書き換え前の class 名 → 書き換え後の class 名 */
const classMap = new Map<string, Map<string, string>>();

/**
 * 結合した CSS を返す。root はリポジトリのルート。
 * 呼んだ後は classOf で class 名を引ける。
 */
export function buildCss(root: string): string {
  const parts = [readFileSync(path.join(root, GLOBAL_FILE), "utf8")];
  for (const [name, file] of Object.entries(MODULE_FILES)) {
    const css = readFileSync(path.join(root, file), "utf8");
    parts.push(`/* ${file} */\n${scopeModule(css, name, file)}`);
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
