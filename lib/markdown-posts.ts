// 記事の Markdown ファイルを読み、表示に使う形（PostContent）にする。
// node:fs を使うので、ビルド時・開発サーバーのサーバー側からだけ使い、クライアントのコンポーネントから import しないこと。
//
// ファイルの形式:
// - 1 記事 1 ファイル（<slug>.md）。ディレクトリの直下に .md だけを置く（. で始まる名前は読まない）
// - 先頭の `---` で囲んだ frontmatter に title、summary、publishedAt（オフセット付きの ISO 8601）を書く。
//   draft: true は下書き。marp: true はスライドの記事
// 読めないファイルは理由を warn に渡してスキップする（ビルドを止めたいときは、warn で例外を投げる）。

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { PostContent } from "./post-types";

type FrontmatterValue = string | boolean;

export interface ParsedMarkdown {
  /** 読めたキーと値。引用符付きの文字列、true / false、素の文字列だけを扱う */
  data: Record<string, FrontmatterValue>;
  /** frontmatter の中の行（区切りの `---` を除く）。Marp の記事で本文の先頭に残すために使う */
  lines: string[];
  /** 閉じの `---` の次の行から末尾まで */
  body: string;
}

/** frontmatter から取り除くキー。Marp の記事では、これ以外の行を本文の先頭に残す */
const POST_KEYS = new Set(["title", "summary", "publishedAt", "draft"]);

const DELIMITER = "---";
const MARKDOWN_SUFFIX = ".md";
const TOP_LEVEL_KEY = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/;
/** オフセット付きの ISO 8601（Z か +09:00 のような時差が必須） */
const OFFSET_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * 先頭の `---` で囲んだ frontmatter を読む最小のパーサー。先頭の行が `---` でない、
 * または閉じの `---` が無ければ undefined。BOM は取り除き、改行は LF にそろえる。
 * 最上位の `key: value` の行だけを読み、値が空のキー、ブロック（`|`、`>`）、インデントした行は読まない。
 */
export function parseFrontmatter(text: string): ParsedMarkdown | undefined {
  const normalized = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const all = normalized.split("\n");
  if (all[0] !== DELIMITER) return undefined;
  const end = all.indexOf(DELIMITER, 1);
  if (end < 0) return undefined;

  const lines = all.slice(1, end);
  const data: Record<string, FrontmatterValue> = {};
  for (const line of lines) {
    const match = TOP_LEVEL_KEY.exec(line);
    if (!match) continue;
    const value = parseScalar(match[2] ?? "");
    if (value !== undefined) data[match[1]] = value;
  }
  return { data, lines, body: all.slice(end + 1).join("\n") };
}

function parseScalar(raw: string): FrontmatterValue | undefined {
  const value = raw.trim();
  const double = /^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/.exec(value);
  if (double) {
    try {
      return JSON.parse(`"${double[1]}"`) as string;
    } catch {
      return double[1];
    }
  }
  const single = /^'((?:[^']|'')*)'\s*(?:#.*)?$/.exec(value);
  if (single) return single[1].replace(/''/g, "'");

  // 素の文字列は、空白の後の # から行末までをコメントとして除く
  const plain = value.replace(/(?:^|\s+)#.*$/, "").trim();
  if (plain === "" || plain.startsWith("|") || plain.startsWith(">")) return undefined;
  if (plain === "true" || plain === "True" || plain === "TRUE") return true;
  if (plain === "false" || plain === "False" || plain === "FALSE") return false;
  return plain;
}

/**
 * ディレクトリの直下の *.md を読み、記事の配列にして返す（並びはファイル名順）。
 * 下書きと未来の publishedAt も含める（出すかどうかは呼び出し側で決める）。
 * ディレクトリが無ければ空の配列。読めないファイルは理由を warn に渡してスキップする。
 */
export function loadPostDirectory(dir: string, warn: (message: string) => void = console.warn): PostContent[] {
  if (!isDirectory(dir)) return [];
  const dirName = path.basename(dir);
  const posts: PostContent[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const label = `${dirName}/${name}`;
    const file = path.join(dir, name);
    if (!name.endsWith(MARKDOWN_SUFFIX) || !statSync(file).isFile()) {
      warn(`[markdown-posts] ${label} を読みません: ${dirName}/ には .md のファイルだけを置く`);
      continue;
    }
    const slug = name.slice(0, -MARKDOWN_SUFFIX.length);
    const result = parsePost(readFileSync(file, "utf8"), slug);
    if (typeof result === "string") {
      warn(`[markdown-posts] ${label} をスキップしました: ${result}`);
    } else {
      posts.push(result);
    }
  }
  return posts;
}

/** 1 ファイル分を記事にする。読めなければ理由の文字列を返す */
function parsePost(text: string, slug: string): PostContent | string {
  const parsed = parseFrontmatter(text);
  if (!parsed) return "先頭に --- で囲んだ frontmatter がありません";
  const { data, lines, body } = parsed;

  const { title, summary, publishedAt, draft = false, marp = false } = data;
  if (typeof title !== "string") return "title がありません";
  if (typeof summary !== "string") return "summary がありません";
  if (typeof publishedAt !== "string") return "publishedAt がありません";
  if (!OFFSET_DATE_TIME.test(publishedAt) || Number.isNaN(Date.parse(publishedAt))) {
    return `publishedAt をオフセット付きの ISO 8601 として読めません（例: 2026-10-10T09:00:00+09:00）: ${publishedAt}`;
  }
  if (typeof draft !== "boolean") return "draft は true か false で書く";
  if (typeof marp !== "boolean") return "marp は true か false で書く";

  const publishedAtUtc = new Date(publishedAt).toISOString();
  // Marp の記事は、title などを除いた frontmatter を本文の先頭に残す（lib/marp.ts が marp: true を見て判定する）
  const kept = lines.filter((line) => !POST_KEYS.has(TOP_LEVEL_KEY.exec(line)?.[1] ?? ""));
  const bodyMarkdown = marp ? [DELIMITER, ...kept, DELIMITER, body].join("\n") : body;
  return {
    slug,
    title,
    summary,
    bodyMarkdown,
    publishedAt: publishedAtUtc,
    updatedAt: publishedAtUtc,
    ...(draft ? { draft } : {}),
  };
}

function isDirectory(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}
