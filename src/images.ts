// 記事の本文が参照する画像を拾う（imageReferences）。公開した記事から参照されている画像だけを out/images/ にコピーするのに使う。

const IMAGE_PATH = /^\/images\/([^/]+)\/([^/]+)$/;

/**
 * 本文の Markdown（frontmatter を含むファイルの中身）が参照する、content/images/ の下の画像の "<slug>/<ファイル名>"。
 * 拾うのは ![…](…)、参照形式の ![…][…]、<img src="…">。フェンスのコードブロック、インラインのコード、
 * HTML のコメントの中は表示されないため拾わない。
 * Marp の記事（frontmatter に marp の行がある）は、frontmatter（style、backgroundImage など）と
 * HTML のコメントの指定（<!-- _backgroundImage: url(…) -->）からも画像を読み込む。
 * そのため、コードの外の url(…) と @import "…" も拾う。
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

/** frontmatter に marp の行があるか（大文字小文字・値は問わない。画像の参照を広めに拾うことを優先する） */
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
