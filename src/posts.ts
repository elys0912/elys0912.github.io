// content/blog/*.md を読み、サイトに出す記事を返す。1 ファイルの読み方は shared/lib/markdown-posts.ts（共有の部品）に任せ、
// ここではブログの規則を足す。
//
// このリポジトリは公開されているので、置いた記事はサイトに出なくても誰でも読める。公開する記事だけを置く。
// 次のどれかがあれば、ビルドを止める（loadPosts が例外を投げる）。
// - 読めないファイル（frontmatter の誤り、. で始まる .md、.md でないファイルなど。markdown-posts.ts の規則）
// - slug（ファイル名）の形の誤り
// - 本文が MAX_BODY_BYTES を超える
// - draft: true の記事（下書きはこのリポジトリの外で書く）
// - publishedAt が未来の記事（予約公開はしない）
//
// 画像の参照の拾い方（imageReferences）も置く。公開した記事から参照されている画像だけを out/images/ にコピーするのに使う。

import path from "node:path";
import { loadPostDirectory } from "../shared/lib/markdown-posts.ts";
import type { PostContent } from "../shared/lib/post-types.ts";

/** リポジトリのルートから見た content/ と、記事と画像を置くディレクトリの名前 */
export const CONTENT_DIRECTORY = "content";
export const POSTS_DIRECTORY_NAME = "blog";
export const IMAGES_DIRECTORY_NAME = "images";

/** slug（ファイル名から .md を除いたもの）。URL と画像のディレクトリ名に使う */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 本文（Marp の記事は先頭に残す frontmatter を含む）の UTF-8 のバイト数（128KB） */
const MAX_BODY_BYTES = 128 * 1024;

/**
 * content/blog/ の記事を読んで検査し、サイトに出す記事を公開日時の新しい順（同時刻なら slug 順）に返す。
 * 問題が 1 件でもあれば、まとめて例外を投げる。
 */
export function loadPosts(contentDir: string, now: Date): PostContent[] {
  const problems: string[] = [];
  const posts = loadPostDirectory(path.join(contentDir, POSTS_DIRECTORY_NAME), (message) => problems.push(message));
  for (const post of posts) {
    const label = `${POSTS_DIRECTORY_NAME}/${post.slug}.md`;
    if (!SLUG_PATTERN.test(post.slug)) {
      problems.push(`${label}: ファイル名（slug）は英小文字・数字と - だけにする（例: first-post.md）`);
    }
    const bytes = new TextEncoder().encode(post.bodyMarkdown).length;
    if (bytes > MAX_BODY_BYTES) {
      problems.push(`${label}: 本文が ${bytes} バイトあります。${MAX_BODY_BYTES} バイト（128KB）までにする（記事を分ける）`);
    }
    if (post.draft) {
      problems.push(`${label}: draft: true の記事は置かない（公開できる状態になってから draft の行を消して置く）`);
    }
    if (Date.parse(post.publishedAt) > now.getTime()) {
      problems.push(`${label}: publishedAt（${post.publishedAt}、UTC）が未来です。公開する日時になってから置く`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`content/blog/ の記事を検査して ${problems.length} 件の問題がありました:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
  return posts.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.slug.localeCompare(b.slug));
}

const IMAGE_PATH = /^\/images\/([^/]+)\/([^/]+)$/;

/**
 * 本文の Markdown（frontmatter を含むファイルの中身）が参照する、content/images/ の下の画像の "<slug>/<ファイル名>"。
 * 拾うのは ![…](…)、参照形式の ![…][…]、<img src="…">。フェンスのコードブロック、インラインのコード、
 * HTML のコメントの中は表示されないので拾わない。
 * Marp の記事（frontmatter に marp の行がある）は、frontmatter（style、backgroundImage など）と
 * HTML のコメントの指定（<!-- _backgroundImage: url(…) -->）からも画像を読み込むので、
 * コードの外の url(…) と @import "…" も拾う。
 * /images/<slug>/<ファイル名> の形でない参照（外部の URL など）は拾わない。
 */
export function imageReferences(text: string): string[] {
  const normalized = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const body = blankOut(normalized);
  const sources: string[] = [];

  const definitions = new Map<string, string>();
  for (const match of body.matchAll(/^ {0,3}\[((?:[^\[\]\\]|\\.)+)\]:[ \t]*(?:\n[ \t]*)?(<[^<>\n]*>|\S+)/gm)) {
    const label = normalizeLabel(match[1]);
    if (!definitions.has(label)) definitions.set(label, unwrap(match[2]));
  }

  const alt = String.raw`((?:[^\[\]\\\n]|\\.|\[[^\[\]\n]*\])*)`;
  const destination = String.raw`(<[^<>\n]*>|(?:[^\s()\\]|\\.|\([^\s()]*\))*)`;
  const title = String.raw`(?:[ \t\n]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?`;
  for (const match of body.matchAll(new RegExp(String.raw`!\[${alt}\]\([ \t\n]*${destination}${title}[ \t\n]*\)`, "g"))) {
    sources.push(unwrap(match[2]));
  }
  for (const match of body.matchAll(new RegExp(String.raw`!\[${alt}\](?:\[((?:[^\[\]\\]|\\.)*)\])?(?![(\[:])`, "g"))) {
    const definition = definitions.get(normalizeLabel(match[2] || match[1]));
    if (definition !== undefined) sources.push(definition);
  }
  for (const match of body.matchAll(/<img\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
    sources.push(match[1] ?? match[2] ?? match[3]);
  }

  if (isMarpText(normalized)) {
    const code = blankInlineCode(blankFences(normalized.split("\n")).join("\n"));
    for (const match of code.matchAll(/\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) {
      const src = match[1] ?? match[2] ?? match[3];
      // url(#id) は SVG の中の参照で、ファイルを読み込まない
      if (!src.startsWith("#")) sources.push(src);
    }
    for (const match of code.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) sources.push(match[1] ?? match[2]);
  }

  return [...new Set(sources.flatMap((src) => imageKeyOf(src.trim()) ?? []))];
}

/** src を "<slug>/<ファイル名>" にする。/images/<slug>/<ファイル名> の形でなければ undefined */
function imageKeyOf(src: string): string | undefined {
  if (!src.startsWith("/") || src.startsWith("//")) return undefined;
  let decoded: string;
  try {
    decoded = decodeURI(src);
  } catch {
    return undefined;
  }
  const match = IMAGE_PATH.exec(decoded);
  if (!match || match[1] === "." || match[1] === ".." || match[2] === "." || match[2] === ".." || /[?#]/.test(decoded)) {
    return undefined;
  }
  return `${match[1]}/${match[2]}`;
}

/** frontmatter に marp の行があるか（大文字小文字・値は問わない。画像の参照を広めに拾う側に倒す） */
function isMarpText(normalized: string): boolean {
  const lines = normalized.split("\n");
  if (lines[0] !== "---") return false;
  const end = lines.indexOf("---", 1);
  return end > 0 && lines.slice(1, end).some((line) => /^\s*marp\s*:/i.test(line));
}

/** frontmatter、フェンスのコードブロック、HTML のコメント、インラインのコードを空白に置き換える。改行は残す */
function blankOut(text: string): string {
  const lines = text.split("\n");
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) for (let i = 0; i <= end; i++) lines[i] = "";
  }
  return blankInlineCode(blankFences(lines).join("\n").replace(/<!--[\s\S]*?-->/g, keepNewlines));
}

/** フェンスのコードブロックの行を空にする（lines を書き換えて返す） */
function blankFences(lines: string[]): string[] {
  // リストの中のコードブロックも拾うため、フェンスの前のインデントは数えない
  let fence: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const opening = /^[ \t]*(`{3,}|~{3,})/.exec(lines[i]);
    if (fence) {
      const closing = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(lines[i]);
      if (closing && closing[1][0] === fence[0] && closing[1].length >= fence.length) fence = undefined;
      lines[i] = "";
    } else if (opening && !(opening[1][0] === "`" && lines[i].slice(opening[0].length).includes("`"))) {
      fence = opening[1];
      lines[i] = "";
    }
  }
  return lines;
}

function blankInlineCode(text: string): string {
  // インラインのコードは段落をまたがない（閉じていない ` で後ろの本文まで消さないため）
  return text.replace(/(`+)(?!`)(?:[^\n]|\n(?![ \t]*\n))*?[^`]\1(?!`)/g, keepNewlines);
}

function keepNewlines(match: string): string {
  return match.replace(/[^\n]/g, " ");
}

function unwrap(destination: string): string {
  return destination.startsWith("<") && destination.endsWith(">") ? destination.slice(1, -1) : destination;
}

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}
