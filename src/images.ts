// 記事の本文が参照する画像を拾う（imageReferences）。公開した記事から参照されている画像だけを out/images/ にコピーするのに使う。

const IMAGE_PATH = /^\/images\/([^/]+)\/([^/]+)$/;

/**
 * デコードした後の slug とファイル名に含めない文字。\ と : は Windows の path.join で区切りやドライブになり、
 * content/images/ の外を指しうる（%5C は decodeURI で \ に戻る）。ほかは Windows のファイル名に使えない文字と制御文字
 */
const UNSAFE_IMAGE_PATH_CHAR = /[\\:*?"<>|\x00-\x1f\x7f]/;

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
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const body = blankOut(normalized);
  const sources = [
    ...inlineImageSources(body),
    ...referenceImageSources(body),
    ...imgTagSources(body),
    ...(isMarpText(normalized) ? marpSources(normalized) : []),
  ];

  return [...new Set(sources.flatMap((src) => imageKeyOf(src.trim()) ?? []))];
}

/** 画像の Markdown の alt（![…] の […]）、リンク先（(…) の中）、タイトル（"…" '…' (…)）の正規表現の部品 */
const IMAGE_ALT = String.raw`((?:[^\[\]\\\n]|\\.|\[[^\[\]\n]*\])*)`;
const IMAGE_DESTINATION = String.raw`(<[^<>\n]*>|(?:[^\s()\\]|\\.|\([^\s()]*\))*)`;
const IMAGE_TITLE = String.raw`(?:[ \t\n]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?`;

/** ![alt](リンク先 "タイトル")。2 番目のグループがリンク先 */
const INLINE_IMAGE = new RegExp(String.raw`!\[${IMAGE_ALT}\]\([ \t\n]*${IMAGE_DESTINATION}${IMAGE_TITLE}[ \t\n]*\)`, "g");

/** ![alt][ラベル]、![alt][]、![alt]。ラベルが空か無ければ alt をラベルとして引く */
const REFERENCE_IMAGE = new RegExp(String.raw`!\[${IMAGE_ALT}\](?:\[((?:[^\[\]\\]|\\.)*)\])?(?![(\[:])`, "g");

/** 参照の定義 [ラベル]: リンク先 */
const REFERENCE_DEFINITION = /^ {0,3}\[((?:[^\[\]\\]|\\.)+)\]:[ \t]*(?:\n[ \t]*)?(<[^<>\n]*>|\S+)/gm;

/** ![…](…) のリンク先 */
function inlineImageSources(body: string): string[] {
  return [...body.matchAll(INLINE_IMAGE)].map((match) => unwrap(match[2]));
}

/** 参照形式の ![…][…] が指す、参照の定義のリンク先。定義が無いものは拾わない */
function referenceImageSources(body: string): string[] {
  const definitions = referenceDefinitions(body);

  return [...body.matchAll(REFERENCE_IMAGE)].flatMap((match) => definitions.get(normalizeLabel(match[2] || match[1])) ?? []);
}

/** 参照の定義（正規化したラベル → リンク先）。同じラベルは最初の定義を使う */
function referenceDefinitions(body: string): Map<string, string> {
  const definitions = new Map<string, string>();
  for (const match of body.matchAll(REFERENCE_DEFINITION)) {
    const label = normalizeLabel(match[1]);
    if (!definitions.has(label)) definitions.set(label, unwrap(match[2]));
  }

  return definitions;
}

/** <img src="…"> の src */
function imgTagSources(body: string): string[] {
  return [...body.matchAll(/<img\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)].map(
    (match) => match[1] ?? match[2] ?? match[3],
  );
}

/** Marp の記事の、コードの外の url(…) と @import "…"。frontmatter と HTML のコメントの中も拾う */
function marpSources(normalized: string): string[] {
  const code = blankInlineCode(blankFences(normalized.split("\n")).join("\n"));
  const urls = [...code.matchAll(/\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)]
    .map((match) => match[1] ?? match[2] ?? match[3])
    // url(#id) は SVG の中の参照で、ファイルを読み込まない
    .filter((src) => !src.startsWith("#"));
  const imports = [...code.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)].map((match) => match[1] ?? match[2]);

  return [...urls, ...imports];
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
  if (match === null) return undefined;

  const [, slug, fileName] = match;
  const hasDotSegment = isDotSegment(slug) || isDotSegment(fileName);
  const hasQueryOrFragment = /[?#]/.test(decoded);
  if (hasDotSegment || hasQueryOrFragment) return undefined;

  // 拾わなかった参照は、書き出した後の checkSiteResources（src/build.ts）で out/ に無いものとしてビルドを止める
  if (UNSAFE_IMAGE_PATH_CHAR.test(decoded)) return undefined;

  return `${slug}/${fileName}`;
}

/** パスの区切りの間が「.」か「..」か（今の階層・上の階層を指す） */
function isDotSegment(segment: string): boolean {
  return segment === "." || segment === "..";
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

/** フェンスのコードブロックの行を空にした写しを返す（lines は書き換えない） */
function blankFences(lines: readonly string[]): string[] {
  const blanked = [...lines];
  // リストの中のコードブロックも拾うため、フェンスの前のインデントは数えない
  let fence: string | undefined;
  for (let i = 0; i < blanked.length; i++) {
    const opening = /^[ \t]*(`{3,}|~{3,})/.exec(blanked[i]);
    if (fence) {
      const closing = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(blanked[i]);
      if (closing && closing[1][0] === fence[0] && closing[1].length >= fence.length) fence = undefined;
      blanked[i] = "";
    } else if (opening && !(opening[1][0] === "`" && blanked[i].slice(opening[0].length).includes("`"))) {
      fence = opening[1];
      blanked[i] = "";
    }
  }

  return blanked;
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
