// content/ の記事と画像の参照を読む共通の処理。依存なし。
// scripts/check-images.mjs（検査）、scripts/postbuild.mjs（out/images/ へのコピー）、lib/posts.ts（ビルド時の参照の形の検査）が
// 同じ規則で参照を拾うために使う。

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT_DIRECTORY, POSTS_DIRECTORY_NAME } from "./content-rules.mjs";

export const POST_DIRECTORIES = [POSTS_DIRECTORY_NAME];
export const IMAGES_DIRECTORY = "images";
const MARKDOWN_SUFFIX = ".md";
const IMAGE_PATH = /^\/images\/([^/]+)\/([^/]+)$/;

/**
 * 読む content/ の場所。環境変数 CONTENT_DIR があればそれを（相対パスは実行時のカレントディレクトリから）、
 * 無ければリポジトリの content/ を使う。
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ dir: string, configured: boolean }} configured は CONTENT_DIR で指定されたかどうか
 */
export function resolveContentDir(env = process.env) {
  const configured = env.CONTENT_DIR?.trim();
  // lib/posts.ts がこのモジュールを next build に取り込むので、new URL("…", import.meta.url) の形は使わない
  // （Turbopack がその形をファイルの参照として解決しようとして失敗する）。scripts/ の 1 つ上がリポジトリのルート
  return configured
    ? { dir: path.resolve(configured), configured: true }
    : { dir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", CONTENT_DIRECTORY), configured: false };
}

/**
 * blog/ の .md（下書きと未来の日付の記事を含む）。並びはファイル名の順。
 * 記事の読み込み（lib/markdown-posts.ts）と同じく、. で始まる名前は読まない（置くこと自体を check-drafts とビルドがエラーにする）。
 * @param {string} contentDir
 * @returns {{ slug: string, file: string, text: string }[]} file は content/ からの相対パス
 */
export function listPosts(contentDir) {
  const posts = [];
  for (const dirName of POST_DIRECTORIES) {
    const dir = path.join(contentDir, dirName);
    if (!isDirectory(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      if (name.startsWith(".") || !name.endsWith(MARKDOWN_SUFFIX) || !isFile(file)) continue;
      const text = readFileSync(file, "utf8");
      posts.push({ slug: name.slice(0, -MARKDOWN_SUFFIX.length), file: `${dirName}/${name}`, text });
    }
  }
  return posts;
}

/**
 * src を "<slug>/<ファイル名>" にする。/images/<slug>/<ファイル名> の形でなければ理由を返す。
 * @param {string} src
 * @returns {string | { reason: string }}
 */
export function imageKeyOf(src) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//")) {
    return { reason: src.toLowerCase().startsWith("data:") ? "data: URL は使わない" : "外部の URL は使わない" };
  }
  if (!src.startsWith("/")) return { reason: "相対パスは使わない" };
  let decoded;
  try {
    decoded = decodeURI(src);
  } catch {
    return { reason: "URL として読めません" };
  }
  const match = IMAGE_PATH.exec(decoded);
  if (!match || match[1] === "." || match[1] === ".." || /[?#]/.test(decoded)) {
    return { reason: "/images/ の下の、<slug>/<ファイル名> の 2 階層で書く。? や # は付けない" };
  }
  return `${match[1]}/${match[2]}`;
}

/**
 * Markdown の本文（frontmatter を除く）から画像の参照を拾う。
 * 拾うのは ![…](…)、参照形式の ![…][…]、<img src="…">。フェンスのコードブロック、インラインのコード、
 * HTML のコメントの中は表示されないので拾わない。
 * Marp の記事（frontmatter に marp の行がある）は、frontmatter（style、backgroundImage など）と
 * HTML のコメントの指定（<!-- _backgroundImage: url(…) -->）からも画像を読み込むので、
 * コードの外の url(…) と @import "…" も拾う。
 * @param {string} text
 * @returns {{ src: string, line: number }[]}
 */
export function extractImageSources(text) {
  const normalized = normalize(text);
  const body = blankOut(normalized);
  const definitions = new Map();
  for (const match of body.matchAll(/^ {0,3}\[((?:[^\[\]\\]|\\.)+)\]:[ \t]*(?:\n[ \t]*)?(<[^<>\n]*>|\S+)/gm)) {
    const label = normalizeLabel(match[1]);
    if (!definitions.has(label)) definitions.set(label, unwrap(match[2]));
  }

  const found = [];
  const add = (src, index, source = body) => found.push({ src, line: source.slice(0, index).split("\n").length, index });
  const alt = String.raw`((?:[^\[\]\\\n]|\\.|\[[^\[\]\n]*\])*)`;
  const destination = String.raw`(<[^<>\n]*>|(?:[^\s()\\]|\\.|\([^\s()]*\))*)`;
  const title = String.raw`(?:[ \t\n]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?`;
  const inline = new RegExp(String.raw`!\[${alt}\]\([ \t\n]*${destination}${title}[ \t\n]*\)`, "g");
  for (const match of body.matchAll(inline)) add(unwrap(match[2]), match.index);

  const reference = new RegExp(String.raw`!\[${alt}\](?:\[((?:[^\[\]\\]|\\.)*)\])?(?![(\[:])`, "g");
  for (const match of body.matchAll(reference)) {
    const label = normalizeLabel(match[2] || match[1]);
    if (definitions.has(label)) add(definitions.get(label), match.index);
  }

  for (const match of body.matchAll(/<img\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
    add(match[1] ?? match[2] ?? match[3], match.index);
  }

  if (isMarpText(normalized)) {
    const code = blankCode(normalized);
    for (const match of code.matchAll(/\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) {
      const src = match[1] ?? match[2] ?? match[3];
      // url(#id) は SVG の中の参照で、ファイルを読み込まない
      if (!src.startsWith("#")) add(src, match.index, code);
    }
    for (const match of code.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) add(match[1] ?? match[2], match.index, code);
  }

  return found
    .sort((a, b) => a.line - b.line || a.index - b.index)
    .map(({ src, line }) => ({ src: src.trim(), line }));
}

/** frontmatter に marp の行があるか（大文字小文字・値は問わない。画像の参照を広めに拾う側に倒す） */
function isMarpText(normalized) {
  const lines = normalized.split("\n");
  if (lines[0] !== "---") return false;
  const end = lines.indexOf("---", 1);
  return end > 0 && lines.slice(1, end).some((line) => /^\s*marp\s*:/i.test(line));
}

/**
 * content/images/<slug>/ の中のファイルを、公開した記事からの参照の有無で分ける（postbuild のコピーに使う）。
 * - published: 公開した記事から参照されている
 * - unpublishedOnly: 公開していない記事（下書き、未来の日付）からだけ参照されている
 * - unreferenced: どこからも参照されていない（check:images ではエラー）
 * @param {string} contentDir
 * @param {(slug: string) => boolean} isPublished 記事を公開したかどうか（postbuild はビルドが出力したページで判定する）
 * @returns {{ published: string[], unpublishedOnly: string[], unreferenced: string[] }} 値は "<slug>/<ファイル名>"
 */
export function classifyImages(contentDir, isPublished) {
  const fromPublished = new Set();
  const fromUnpublished = new Set();
  for (const post of listPosts(contentDir)) {
    for (const { src } of extractImageSources(post.text)) {
      const key = imageKeyOf(src);
      if (typeof key === "string") (isPublished(post.slug) ? fromPublished : fromUnpublished).add(key);
    }
  }
  const result = { published: [], unpublishedOnly: [], unreferenced: [] };
  for (const key of listImageKeys(contentDir)) {
    if (fromPublished.has(key)) result.published.push(key);
    else if (fromUnpublished.has(key)) result.unpublishedOnly.push(key);
    else result.unreferenced.push(key);
  }
  return result;
}

/** content/images/<slug>/<ファイル名> のファイルの "<slug>/<ファイル名>"（名前順） */
function listImageKeys(contentDir) {
  const keys = [];
  const root = path.join(contentDir, IMAGES_DIRECTORY);
  if (!isDirectory(root)) return keys;
  for (const slug of readdirSync(root).sort()) {
    const slugDir = path.join(root, slug);
    if (!isDirectory(slugDir)) continue;
    for (const name of readdirSync(slugDir).sort()) {
      if (isFile(path.join(slugDir, name))) keys.push(`${slug}/${name}`);
    }
  }
  return keys;
}

/** BOM を取り除き、改行を LF にそろえる */
function normalize(text) {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

/**
 * frontmatter、フェンスのコードブロック、HTML のコメント、インラインのコードを空白に置き換える。
 * 改行は残すので、行番号は元のファイルと一致する。
 */
function blankOut(text) {
  const lines = text.split("\n");
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) for (let i = 0; i <= end; i++) lines[i] = "";
  }
  return blankInlineCode(blankFences(lines).join("\n").replace(/<!--[\s\S]*?-->/g, keepNewlines));
}

/** フェンスのコードブロックとインラインのコードだけを空白に置き換える（frontmatter と HTML のコメントは残す）。改行は残す */
function blankCode(text) {
  return blankInlineCode(blankFences(text.split("\n")).join("\n"));
}

/** フェンスのコードブロックの行を空にする（lines を書き換えて返す） */
function blankFences(lines) {
  // リストの中のコードブロックも拾うため、フェンスの前のインデントは数えない
  let fence;
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

function blankInlineCode(text) {
  // インラインのコードは段落をまたがない（閉じていない ` で後ろの本文まで消さないため）
  return text.replace(/(`+)(?!`)(?:[^\n]|\n(?![ \t]*\n))*?[^`]\1(?!`)/g, keepNewlines);
}

function keepNewlines(match) {
  return match.replace(/[^\n]/g, " ");
}

function unwrap(destination) {
  return destination.startsWith("<") && destination.endsWith(">") ? destination.slice(1, -1) : destination;
}

function normalizeLabel(label) {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isDirectory(target) {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(target) {
  try {
    return statSync(target).isFile();
  } catch {
    return false;
  }
}
