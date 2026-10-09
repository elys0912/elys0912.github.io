// 記事の Markdown ファイルを読み、表示に使う形（PostContent）にする。
// node:fs を使うので、ビルド時・開発サーバーのサーバー側からだけ使い、クライアントのコンポーネントから import しないこと。
//
// ファイルの形式:
// - 1 記事 1 ファイル（<slug>.md）。ディレクトリの直下に .md だけを置く。. で始まる .md は読まずにエラーにする
//   （.gitkeep のような .md でない . で始まるファイルは対象外で、黙って読まない）
// - UTF-8 で書く（BOM は取り除く）
// - 先頭の `---` で囲んだ frontmatter に title、summary、publishedAt（オフセット付きの ISO 8601）を書く。
//   draft: true は下書き。marp: true はスライドの記事で、Marp の指定（theme など）はこのときだけ書ける
// - 作品として読むとき（loadPostDirectory の options.work）だけ、作品の付帯情報 badge、tech、repository を書ける。
//   ブログ（options を渡さない）では、ほかの知らないキーと同じくエラーにする
// - frontmatter は YAML のうち、parseFrontmatter の規則の範囲だけを読む。範囲の外の書き方は推測せず、エラーにする
//   （例: draft:true、Draft: true、インデントした draft: true を、下書きと読み損ねて公開しないため）
// 読めないファイルは理由を warn に渡してスキップする（ビルドを止めたいときは、warn で例外を投げる）。
//
// 同じ入力に対する判定を API の取り込み側の検証とそろえている。そろっていることを確かめるケースは
// markdown-posts.cases.json にあり、テストがそれを流す。

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { PostContent } from "./post-types";

type FrontmatterValue = string | boolean | string[];

/** 作品のバッジ。play は遊べるゲーム、live は稼働中のサイト、oss は公開リポジトリ */
export const WORK_BADGES = ["play", "live", "oss"] as const;
export type WorkBadge = (typeof WORK_BADGES)[number];

/** 作品の付帯情報（作品として読んだときだけ付く） */
export type WorkFields = {
  /** 無ければ付けない */
  badge?: WorkBadge;
  /** 書いた順。無ければ空 */
  tech: string[];
  /** https の URL。無ければ付けない */
  repositoryUrl?: string;
};

/** 作品として読んだ記事 */
export type WorkPostContent = PostContent & WorkFields;

export type LoadOptions = {
  /** 作品として読む（作品の付帯情報 badge、tech、repository を許す） */
  work?: boolean;
};

export interface ParsedMarkdown {
  /** 1 行で書いた値。引用符付きの文字列、真偽値、素の文字列、1 行のリスト（[a, b]。要素は素の文字列） */
  data: Record<string, FrontmatterValue>;
  /** ブロック（`|` や `>`）で書いたキー。値は読まない（Marp の記事では、行をそのまま本文の先頭に残す） */
  blockKeys: string[];
  /** frontmatter の中の行（区切りの `---` を除く）。Marp の記事で本文の先頭に残すために使う */
  lines: string[];
  /** 閉じの `---` の次の行から末尾まで */
  body: string;
}

/** frontmatter から取り除くキー。Marp の記事では、これ以外の行を本文の先頭に残す */
const POST_KEYS = new Set(["title", "summary", "publishedAt", "draft"]);
const MARP_KEY = "marp";
/** Marp の記事（marp: true）にだけ書けるキー（Marp のグローバルディレクティブ） */
const MARP_DIRECTIVE_KEYS = new Set(["theme", "paginate", "class", "style", "header", "footer", "size", "math"]);
const KNOWN_KEYS = [...POST_KEYS, MARP_KEY, ...MARP_DIRECTIVE_KEYS];
/** 作品の付帯情報のキー。作品として読むときだけ書ける。frontmatter から取り除く（Marp の記事でも本文に残さない） */
const WORK_KEYS = new Set(["badge", "tech", "repository"]);
const WORK_KNOWN_KEYS = [...KNOWN_KEYS, ...WORK_KEYS];
const MAX_TITLE_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 500;
const MAX_TECH_ITEMS = 10;
const MAX_TECH_LENGTH = 40;
const MAX_REPOSITORY_URL_LENGTH = 500;
/** repository の形。https で、ホスト名（ドットを含む）の後に、空白を含まない ASCII のパスを置ける（ContentLoader と同じ） */
const REPOSITORY_URL = /^https:\/\/[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?:\/[!-~]*)?$/;

const DELIMITER = "---";
const MARKDOWN_SUFFIX = ".md";

/** 最上位の `key: value` の行。コロンの後は空白（タブは不可）か行末 */
const KEY_LINE = /^([A-Za-z_][A-Za-z0-9_-]*):(?: +(.*))?$/;
/** 使えない文字（制御文字、YAML が改行とみなす文字、BOM など） */
const FORBIDDEN_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029\uFEFF\uFFFE\uFFFF]/;
/** 1 行の "…"。エスケープは \" と \\ だけ。後ろには空白と # からのコメントだけを置ける */
const DOUBLE_QUOTED = /^"((?:[^"\\]|\\["\\])*)"(?: +#.*)? *$/;
/** 1 行の '…'。'' は ' 1 字 */
const SINGLE_QUOTED = /^'((?:[^']|'')*)'(?: +#.*)? *$/;
/** 1 行のリスト [a, b]。中に括弧は書けない（入れ子にしない）。後ろには空白と # からのコメントだけを置ける */
const FLOW_SEQUENCE = /^\[([^[\]{}]*)\](?: +#.*)? *$/;
/** リストの要素に書けない文字（YAML のリストの中で記号になる括弧と、空白の後の #） */
const FLOW_ITEM_FORBIDDEN = /[[\]{}]|[ \t]#/;
/** ブロックの始まり（| か >。+ か - の指定と、後ろのコメントは可。インデントの数の指定は不可） */
const BLOCK_HEADER = /^[|>][+-]?(?: +#.*)? *$/;
/** YAML の記号で始まり、文字列として読まれない値 */
const SPECIAL_START = /^(?:[[\]{}&*!%@`,|>'"\t]|[-?:](?:[ \t]|$)|<<$)/;
/** YAML が数値（や日付）として読みうる値。少しでも疑わしいものはまとめて弾く */
const NUMBER_LIKE = /^[-+]?(?:\.?[0-9][0-9a-fA-FxX_.:+-]*|\.(?:inf|Inf|INF|nan|NaN|NAN))$/;
const NULLS = new Set(["~", "null", "Null", "NULL"]);
/** YAML 1.1 の真偽値として読まれる語（これ以外の綴りは文字列） */
const BOOLEANS = new Map<string, boolean>([
  ...["true", "True", "TRUE", "yes", "Yes", "YES", "on", "On", "ON"].map((word): [string, boolean] => [word, true]),
  ...["false", "False", "FALSE", "no", "No", "NO", "off", "Off", "OFF"].map((word): [string, boolean] => [word, false]),
]);
/** オフセット付きの ISO 8601（Z か +09:00 のような時差が必須。秒と小数 9 桁までは省略可） */
const OFFSET_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-](\d{2}):(\d{2}))$/;
/** 空白とみなす文字（title と summary が空白だけかどうかの判定に使う） */
const BLANK = /^[\t \u1680\u2000-\u2006\u2008-\u200A\u205F\u3000]*$/;

/**
 * 先頭の `---` で囲んだ frontmatter を読む。BOM は取り除き、改行は LF にそろえる。
 * 読めなければ理由の文字列を返す。frontmatter の行は次のどれかであること:
 * - 空の行（空白だけも可）、行頭が `#` のコメント
 * - 行頭から書いた `key: value`（key は英字か _ で始まり、英数字、_、- が続く）。同じキーは 1 回だけ
 *   - value は `"…"`（エスケープは `\"` と `\\` だけ）、`'…'`、素の文字列、真偽値（true / false / yes / no / on / off。
 *     先頭だけ大文字、全部大文字も可）、1 行のリスト `[a, b]` のどれか。後ろの ` # …` はコメント
 *   - リストの要素は素の文字列だけ（引用符、真偽値、括弧、空白の後の #、空の要素は不可）。空のリスト `[]` も不可
 *   - 素の文字列は、空、null（`~` を含む）、数値や日付に見えるもの、YAML の記号で始まるもの、`: ` を含むものは不可（引用符で囲む）
 *   - value が `|` か `>`（`+` か `-` を付けても可）のときはブロック。続く行は、空白で 1 段以上インデントし、
 *     インデントを最初の行より浅くしない。最初の行の前に空白だけの行を置かない
 * - それ以外（`key:value`、インデントした行、タブで始まる行、制御文字を含む行など）はエラー
 */
export function parseFrontmatter(text: string): ParsedMarkdown | string {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const all = normalized.split("\n");
  if (all[0] !== DELIMITER) return "先頭に --- で囲んだ frontmatter がありません";
  const end = all.indexOf(DELIMITER, 1);
  if (end < 0) return "frontmatter の閉じの --- がありません";

  const lines = all.slice(1, end);
  // Map で集めて最後にオブジェクトにする（__proto__ のようなキーも、自前のプロパティとして残すため）
  const data = new Map<string, FrontmatterValue>();
  const blockKeys: string[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];
  // ブロックの中にいる間は、そのインデント（最初の行を読むまでは undefined）
  let block: { indent?: number } | undefined;
  lines.forEach((line, index) => {
    const where = `frontmatter の ${index + 2} 行目`;
    if (FORBIDDEN_CHARACTER.test(line)) {
      errors.push(`${where}: 制御文字など、使えない文字があります`);
      block = undefined;
      return;
    }
    if (block) {
      if (line === "") return;
      const indent = /^ */.exec(line)![0].length;
      if (indent === line.length) {
        if (block.indent === undefined) errors.push(`${where}: ブロックの最初の行の前に、空白だけの行を置かない`);
        return;
      }
      if (indent > 0) {
        if (block.indent === undefined) block.indent = indent;
        else if (indent < block.indent) errors.push(`${where}: ブロックの行のインデントが最初の行より浅い`);
        return;
      }
      block = undefined;
    }
    if (/^ *$/.test(line) || line.startsWith("#")) return;
    if (line.startsWith(" ") || line.startsWith("\t")) {
      errors.push(`${where}: インデントした行は読めません（キーは行頭から書く）: ${line.trim()}`);
      return;
    }
    const match = KEY_LINE.exec(line);
    if (!match) {
      errors.push(`${where}: 「key: value」の形で読めません（コロンの後に空白を入れる）: ${line}`);
      return;
    }
    const [, key, value = ""] = match;
    if (seen.has(key)) errors.push(`${where}: ${key} が 2 回以上あります`);
    seen.add(key);
    if (BLOCK_HEADER.test(value)) {
      blockKeys.push(key);
      block = {};
      return;
    }
    const scalar = parseScalar(value);
    if (typeof scalar === "object" && !Array.isArray(scalar)) errors.push(`${where}: ${key} の${scalar.reason}`);
    else data.set(key, scalar);
  });
  if (errors.length > 0) return errors.join(" / ");
  return { data: Object.fromEntries(data), blockKeys, lines, body: all.slice(end + 1).join("\n") };
}

function parseScalar(value: string): FrontmatterValue | { reason: string } {
  if (value.startsWith('"')) {
    const double = DOUBLE_QUOTED.exec(value);
    if (double) return double[1].replace(/\\(["\\])/g, "$1");
    return { reason: `"…" を読めません（1 行で閉じる。エスケープは \\" と \\\\ だけ。後ろにはコメントだけを置ける）` };
  }
  if (value.startsWith("'")) {
    const single = SINGLE_QUOTED.exec(value);
    if (single) return single[1].replace(/''/g, "'");
    return { reason: "'…' を読めません（1 行で閉じる。後ろにはコメントだけを置ける）" };
  }
  if (value.startsWith("[")) return parseFlowSequence(value);
  // 空白（タブを含む）の後の # から行末まではコメント
  const plain = value.replace(/(?:^|[ \t]+)#.*$/, "").replace(/[ \t]+$/, "");
  return parsePlain(plain);
}

/** 1 行のリスト [a, b]。要素は素の文字列だけ */
function parseFlowSequence(value: string): string[] | { reason: string } {
  const match = FLOW_SEQUENCE.exec(value);
  if (!match) return { reason: "[…] を読めません（1 行で閉じる。括弧を入れ子にしない。後ろにはコメントだけを置ける）" };
  const inner = match[1];
  // 空白は YAML と同じく、スペースとタブだけを数える（ContentLoader と判定をそろえる）
  if (/^[ \t]*$/.test(inner)) return { reason: "リストが空です（書かないならキーごと消す）" };
  const items: string[] = [];
  for (const raw of inner.split(",")) {
    const item = raw.replace(/^[ \t]+|[ \t]+$/g, "");
    if (item === "") return { reason: "リストに空の要素があります" };
    if (FLOW_ITEM_FORBIDDEN.test(item)) return { reason: `リストの要素に括弧か「 #」があります: ${item}` };
    if (BOOLEANS.has(item)) return { reason: `リストの要素が真偽値として読まれます: ${item}` };
    const parsed = parsePlain(item);
    if (typeof parsed !== "string") {
      return { reason: `リストの要素は素の文字列で書く（${typeof parsed === "object" ? parsed.reason : item}）` };
    }
    items.push(parsed);
  }
  return items;
}

/** コメントを除いた素の値。真偽値の語なら真偽値、それ以外は文字列 */
function parsePlain(plain: string): string | boolean | { reason: string } {
  if (plain === "" || NULLS.has(plain)) return { reason: "値が空です（null は使わない）" };
  if (SPECIAL_START.test(plain)) return { reason: `値が YAML の記号で始まります。文字列なら引用符で囲む: ${plain}` };
  if (/:(?:[ \t]|$)/.test(plain)) return { reason: `値に「: 」があります。文字列なら引用符で囲む: ${plain}` };
  if (NUMBER_LIKE.test(plain)) return { reason: `値が数値や日付として読まれます。文字列なら引用符で囲む: ${plain}` };
  return BOOLEANS.get(plain) ?? plain;
}

/**
 * ディレクトリの直下の *.md を読み、記事の配列にして返す（並びはファイル名順）。
 * 下書きと未来の publishedAt も含める（出すかどうかは呼び出し側で決める）。
 * ディレクトリが無ければ空の配列。読めないファイルと . で始まる .md は、理由を warn に渡してスキップする。
 * options.work を付けると作品として読み、作品の付帯情報（badge、tech、repository）を許して WorkFields を付ける。
 */
export function loadPostDirectory(dir: string, warn?: (message: string) => void): PostContent[];
export function loadPostDirectory(
  dir: string,
  warn: ((message: string) => void) | undefined,
  options: LoadOptions & { work: true },
): WorkPostContent[];
export function loadPostDirectory(
  dir: string,
  warn: (message: string) => void = console.warn,
  options: LoadOptions = {},
): PostContent[] {
  if (!isDirectory(dir)) return [];
  const dirName = path.basename(dir);
  const posts: PostContent[] = [];
  for (const name of readdirSync(dir).sort()) {
    const label = `${dirName}/${name}`;
    if (name.startsWith(".")) {
      // 黙って読み飛ばすと、公開したつもりの記事が出ない・下書きの印が読まれないまま気づけないので、.md はエラーにする
      if (name.endsWith(MARKDOWN_SUFFIX)) {
        warn(`[markdown-posts] ${label} を読みません: . で始まる .md は置かない（下書きは draft: true にする）`);
      }
      continue;
    }
    const file = path.join(dir, name);
    if (!name.endsWith(MARKDOWN_SUFFIX) || !statSync(file).isFile()) {
      warn(`[markdown-posts] ${label} を読みません: ${dirName}/ には .md のファイルだけを置く`);
      continue;
    }
    const slug = name.slice(0, -MARKDOWN_SUFFIX.length);
    const result = parsePost(readFileSync(file), slug, options.work === true);
    if (typeof result === "string") {
      warn(`[markdown-posts] ${label} をスキップしました: ${result}`);
    } else {
      posts.push(result);
    }
  }
  return posts;
}

/** 1 ファイル分を記事にする。work なら作品として読む（付帯情報を許す）。読めなければ理由の文字列を返す */
function parsePost(bytes: Uint8Array, slug: string, work: boolean): PostContent | WorkPostContent | string {
  let text: string;
  try {
    // BOM は parseFrontmatter が 1 つだけ取り除く（ここでも取り除くと、BOM が 2 つあるファイルを読めてしまう）
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return "UTF-8 として読めません";
  }
  const parsed = parseFrontmatter(text);
  if (typeof parsed === "string") return parsed;
  const { data, blockKeys, lines, body } = parsed;

  const errors: string[] = [];
  const keys = [...Object.keys(data), ...blockKeys];
  const knownKeys = work ? WORK_KNOWN_KEYS : KNOWN_KEYS;
  for (const key of keys) {
    if (knownKeys.includes(key)) continue;
    const known = knownKeys.find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    errors.push(
      known ? `${key} は読めません（${known} と大文字小文字が違う）` : `${key} は読めません（書けるキーは ${knownKeys.join("、")}）`,
    );
  }
  for (const key of blockKeys) {
    if (POST_KEYS.has(key) || key === MARP_KEY || (work && WORK_KEYS.has(key))) {
      errors.push(`${key} はブロック（| や >）にせず 1 行で書く`);
    }
  }
  // リストは作品の tech にだけ書ける（Marp の指定にリストを書くと、そのまま本文の先頭に残ってしまう）
  const lists = Object.keys(data).filter((key) => Array.isArray(data[key]) && !WORK_KEYS.has(key));
  if (lists.length > 0) errors.push(`${lists.join("、")} はリストにせず 1 つの値で書く（リストは tech だけ）`);
  const workFields = work ? readWorkFields(data, errors) : undefined;

  // ブロックで書いたキーは上でエラーにしたので、「ありません」は重ねない
  const missing = (key: string) => !Object.hasOwn(data, key) && !blockKeys.includes(key);
  const { title, summary, publishedAt, draft = false, marp = false } = data;
  checkText("title", title, MAX_TITLE_LENGTH, missing("title"), errors);
  checkText("summary", summary, MAX_SUMMARY_LENGTH, missing("summary"), errors);
  const publishedAtUtc = typeof publishedAt === "string" ? toUtc(publishedAt) : undefined;
  if (missing("publishedAt")) errors.push("publishedAt がありません");
  else if (publishedAt !== undefined && publishedAtUtc === undefined) {
    errors.push(`publishedAt をオフセット付きの ISO 8601 として読めません（例: 2026-10-10T09:00:00+09:00）: ${publishedAt}`);
  }
  if (typeof draft !== "boolean") errors.push("draft は true か false で書く");
  if (typeof marp !== "boolean") errors.push("marp は true か false で書く");
  if (marp !== true) {
    const directives = keys.filter((key) => MARP_DIRECTIVE_KEYS.has(key));
    if (directives.length > 0) errors.push(`${directives.join("、")} は Marp の記事（marp: true）にだけ書ける`);
  }
  // 型の絞り込みのための条件（errors が空なら、title と summary は文字列、publishedAtUtc はある）
  if (errors.length > 0 || typeof title !== "string" || typeof summary !== "string" || publishedAtUtc === undefined) {
    return errors.join(" / ");
  }

  // Marp の記事は、title などと作品の付帯情報を除いた frontmatter を本文の先頭に残す（lib/marp.ts が marp: true を見て判定する）。
  // yes / on などで書いた真偽値は true / false に書き直す
  const kept = lines.flatMap((line) => {
    const key = KEY_LINE.exec(line)?.[1];
    if (key !== undefined && (POST_KEYS.has(key) || WORK_KEYS.has(key))) return [];
    const value = key !== undefined && Object.hasOwn(data, key) ? data[key] : undefined;
    return typeof value === "boolean" ? [`${key}: ${value}`] : [line];
  });
  const bodyMarkdown = marp === true ? [DELIMITER, ...kept, DELIMITER, body].join("\n") : body;
  return {
    slug,
    title,
    summary,
    bodyMarkdown,
    publishedAt: publishedAtUtc,
    updatedAt: publishedAtUtc,
    ...(draft === true ? { draft } : {}),
    ...workFields,
  };
}

/**
 * 作品の付帯情報を読む（ContentLoader の readWorkMeta と同じ規則）。問題は errors に足す。
 * - badge：WORK_BADGES のどれか。oss ならリポジトリが要る
 * - tech：1 行のリスト。1〜MAX_TECH_ITEMS 個、1 個 MAX_TECH_LENGTH 文字まで、同じ語は 1 回だけ
 * - repository：REPOSITORY_URL の形で MAX_REPOSITORY_URL_LENGTH 文字まで
 * ブロックで書いたキーは data に入らない（呼び出し側でエラーにしてある）。
 */
function readWorkFields(data: Record<string, FrontmatterValue>, errors: string[]): WorkFields {
  const { badge, tech, repository } = data;
  const fields: WorkFields = { tech: [] };
  if (badge !== undefined) {
    if (typeof badge === "string" && isWorkBadge(badge)) fields.badge = badge;
    else errors.push(`badge は ${WORK_BADGES.join("、")} のどれかで書く`);
  }
  if (tech !== undefined) {
    if (!Array.isArray(tech)) errors.push("tech は 1 行のリストで書く（例: tech: [TypeScript, Node.js]）");
    else if (tech.length > MAX_TECH_ITEMS) errors.push(`tech は ${MAX_TECH_ITEMS} 個まで`);
    else if (tech.some((item) => [...item].length > MAX_TECH_LENGTH)) errors.push(`tech の 1 個は ${MAX_TECH_LENGTH} 文字まで`);
    else if (new Set(tech).size !== tech.length) errors.push("tech に同じ語が 2 回以上あります");
    else fields.tech = tech;
  }
  if (repository !== undefined) {
    if (typeof repository === "string" && REPOSITORY_URL.test(repository) && repository.length <= MAX_REPOSITORY_URL_LENGTH) {
      fields.repositoryUrl = repository;
    } else {
      errors.push(`repository は https の URL で書く（例: https://github.com/owner/repo。${MAX_REPOSITORY_URL_LENGTH} 文字まで）`);
    }
  }
  if (badge === "oss" && repository === undefined) errors.push("badge: oss には repository が要る");
  return fields;
}

function isWorkBadge(value: string): value is WorkBadge {
  return (WORK_BADGES as readonly string[]).includes(value);
}

/** 必須の文字列。空白だけは不可、長さはコードポイントで数える */
function checkText(
  key: string,
  value: FrontmatterValue | undefined,
  maxLength: number,
  missing: boolean,
  errors: string[],
): void {
  if (missing) errors.push(`${key} がありません`);
  else if (value === undefined) return;
  else if (typeof value !== "string" || BLANK.test(value)) errors.push(`${key} は空でない文字列で書く`);
  else if ([...value].length > maxLength) errors.push(`${key} は ${maxLength} 文字まで`);
}

/** オフセット付きの ISO 8601 を UTC の ISO 文字列にする。暦に無い日時（2 月 30 日、24 時など）は undefined */
function toUtc(value: string): string | undefined {
  const match = OFFSET_DATE_TIME.exec(value);
  if (!match) return undefined;
  // 省略した秒と時差（Z）は 0
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = match.slice(1).map((part) => Number(part ?? 0));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (days === undefined || day < 1 || day > days) return undefined;
  if (hour > 23 || minute > 59 || second > 59 || offsetMinute > 59 || offsetHour * 60 + offsetMinute > 18 * 60) {
    return undefined;
  }
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? undefined : time.toISOString();
}

function isDirectory(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}
