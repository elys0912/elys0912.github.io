// content/images/ の画像と、記事の本文からの参照を検査する（npm run check:images）。依存なし。
//
// - content/images/ の直下は <slug>/ のディレクトリだけ。slug は content/blog/ の .md に実在すること
// - <slug>/ の中は画像のファイルだけ（サブディレクトリは置かない）。ファイル名は英数字と . _ - だけ
// - 形式は WebP、PNG、JPEG（中身の先頭のバイトで判定し、拡張子 .webp / .png / .jpg・.jpeg と一致すること）。
//   1 枚 500KB（512,000 バイト）まで
// - 1 記事（<slug>/ ごと）の画像は 40 枚、合計 5MB（5,242,880 バイト）まで
// - content/images/ の合計が 300MB（314,572,800 バイト）を超えたら警告する（エラーにはしない）
// - EXIF / XMP / IPTC などのメタデータが入っていたらエラー（GPS などの位置情報が残りうるため）
// - 全記事の本文の ![…](…) と <img src="…">（Marp の記事では、frontmatter と HTML のコメントの指定も含めた url(…) と
//   @import "…" も）は /images/<slug>/<ファイル名> だけを許し（外部の URL、data:、相対パスは拒否）、
//   存在しない画像への参照と、どこからも参照されていない画像をエラーにする
//
// 上限の値は content-limits.mjs にまとめてある。
// エラーはまとめて出し、1 件でもあれば終了コード 1。警告だけなら終了コード 0。

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractImageSources,
  imageKeyOf,
  IMAGES_DIRECTORY,
  isDirectory,
  isFile,
  listPosts,
  resolveContentDir,
} from "./content-images.mjs";
import {
  IMAGES_TOTAL_WARN_BYTES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_BYTES_PER_POST,
  MAX_IMAGES_PER_POST,
} from "./content-limits.mjs";
import { SLUG_PATTERN } from "./content-rules.mjs";

const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FORMATS = {
  webp: { label: "WebP", extensions: [".webp"] },
  png: { label: "PNG", extensions: [".png"] },
  jpeg: { label: "JPEG", extensions: [".jpg", ".jpeg"] },
};
const METADATA_REASON = "GPS などの位置情報が残りうるため、置く前に除去する";

/**
 * content/ を検査する。
 * @param {string} contentDir
 * @returns {{ errors: string[], warnings: string[], imageCount: number, referenceCount: number, totalBytes: number }}
 *   totalBytes は content/images/ の画像の合計のバイト数
 */
export function checkImages(contentDir) {
  const errors = [];
  const posts = listPosts(contentDir);
  const slugs = new Set(posts.map((post) => post.slug));
  const sizesBySlug = new Map();
  const images = listImages(contentDir, slugs, errors, sizesBySlug);
  const sizes = checkImageSizes(sizesBySlug);
  errors.push(...sizes.errors);

  const referenced = new Set();
  let referenceCount = 0;
  for (const post of posts) {
    for (const { src, line } of extractImageSources(post.text)) {
      referenceCount++;
      const where = `${post.file}:${line}`;
      const key = imageKeyOf(src);
      if (typeof key !== "string") {
        errors.push(`${where}: 画像の参照は /images/<slug>/<ファイル名> だけ（${key.reason}）: ${src}`);
      } else if (!images.has(key)) {
        errors.push(`${where}: 参照先の画像がありません: ${src}（content/images/${key}）`);
      } else {
        referenced.add(key);
      }
    }
  }
  for (const key of images) {
    if (!referenced.has(key)) {
      errors.push(`images/${key}: どの記事からも参照されていません（使わない画像は消す）`);
    }
  }
  return { errors, warnings: sizes.warnings, imageCount: images.size, referenceCount, totalBytes: sizes.totalBytes };
}

/**
 * 1 記事ごとの画像の枚数と合計、content/images/ 全体の合計を調べる。ファイルを読まずにサイズだけで判定する。
 * @param {Map<string, number[]>} sizesBySlug slug ごとの、画像 1 枚ずつのバイト数
 * @returns {{ errors: string[], warnings: string[], totalBytes: number }}
 */
export function checkImageSizes(sizesBySlug) {
  const errors = [];
  const warnings = [];
  let totalBytes = 0;
  for (const [slug, sizes] of sizesBySlug) {
    const bytes = sizes.reduce((sum, size) => sum + size, 0);
    totalBytes += bytes;
    if (sizes.length > MAX_IMAGES_PER_POST) {
      errors.push(`images/${slug}/: 画像が ${sizes.length} 枚あります。1 記事 ${MAX_IMAGES_PER_POST} 枚までにする（記事を分ける）`);
    }
    if (bytes > MAX_IMAGE_BYTES_PER_POST) {
      errors.push(
        `images/${slug}/: 画像の合計が ${bytes} バイトあります。1 記事 ${MAX_IMAGE_BYTES_PER_POST} バイト（5MB）までにする（縮小・圧縮するか、記事を分ける）`,
      );
    }
  }
  if (totalBytes > IMAGES_TOTAL_WARN_BYTES) {
    warnings.push(
      `content/images/ の合計が ${totalBytes} バイトあり、${IMAGES_TOTAL_WARN_BYTES} バイト（300MB）を超えています。画像の置き場所や履歴の整理を見直す`,
    );
  }
  return { errors, warnings, totalBytes };
}

/**
 * content/images/<slug>/<ファイル名> を調べ、"<slug>/<ファイル名>" の集合を返す。
 * 問題のあるファイルもエラーを積んだうえで集合に入れる（参照の検査で「参照先が無い」と二重に出さないため）。
 * sizesBySlug には slug ごとに、ファイル 1 つずつのバイト数を入れる（問題のあるファイルも数える）。
 */
function listImages(contentDir, slugs, errors, sizesBySlug) {
  const images = new Set();
  const root = path.join(contentDir, IMAGES_DIRECTORY);
  if (!isDirectory(root)) return images;

  for (const slug of readdirSync(root).sort()) {
    const slugDir = path.join(root, slug);
    if (!isDirectory(slugDir)) {
      errors.push(`images/${slug}: images/ の直下には <slug>/ のディレクトリだけを置く`);
      continue;
    }
    if (!SLUG_PATTERN.test(slug) || !slugs.has(slug)) {
      errors.push(`images/${slug}/: blog/ に ${slug}.md がありません（ディレクトリ名は記事の slug にする）`);
    }
    const sizes = [];
    sizesBySlug.set(slug, sizes);
    for (const name of readdirSync(slugDir).sort()) {
      const label = `images/${slug}/${name}`;
      const file = path.join(slugDir, name);
      if (!isFile(file)) {
        errors.push(`${label}: images/<slug>/ の中にサブディレクトリは置かない`);
        continue;
      }
      images.add(`${slug}/${name}`);
      if (!FILE_NAME.test(name)) {
        errors.push(`${label}: ファイル名は英数字と . _ - だけにする（先頭は英数字）`);
      }
      const bytes = readFileSync(file);
      sizes.push(bytes.length);
      errors.push(...inspectImage(bytes, name).map((message) => `${label}: ${message}`));
    }
  }
  return images;
}

/**
 * 1 枚の画像の形式・サイズ・メタデータを調べ、問題の一覧を返す（問題が無ければ空）。
 * @param {Uint8Array} bytes
 * @param {string} name ファイル名（拡張子の確認に使う）
 * @returns {string[]}
 */
export function inspectImage(bytes, name) {
  const problems = [];
  if (bytes.length > MAX_IMAGE_BYTES) {
    problems.push(`${bytes.length} バイトあります。1 枚 ${MAX_IMAGE_BYTES} バイト（500KB）までにする（置く前に縮小・圧縮する）`);
  }
  const format = detectFormat(bytes);
  if (format === undefined) {
    problems.push("WebP、PNG、JPEG のどれでもありません（ファイルの中身で判定しています）");
    return problems;
  }
  const { label, extensions } = FORMATS[format];
  if (!extensions.includes(path.extname(name))) {
    problems.push(`中身は ${label} なので、拡張子を ${extensions.join(" か ")} にする`);
  }
  const reader = { webp: readWebpChunks, png: readPngChunks, jpeg: readJpegSegments }[format];
  const { metadata, broken } = reader(bytes);
  if (broken) problems.push(`${label} として読めません: ${broken}`);
  if (metadata.length > 0) {
    problems.push(`メタデータ（${[...new Set(metadata)].join("、")}）が入っています。${METADATA_REASON}`);
  }
  return problems;
}

/** @returns {"webp" | "png" | "jpeg" | undefined} */
function detectFormat(bytes) {
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  return undefined;
}

/** WebP（RIFF）のチャンクをたどり、EXIF と XMP のチャンクを探す */
function readWebpChunks(bytes) {
  const metadata = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12) return { metadata, broken: "ヘッダーが途中で切れています" };
  const end = Math.min(bytes.length, 8 + view.getUint32(4, true));
  let offset = 12;
  while (offset + 8 <= end) {
    const type = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (type === "EXIF") metadata.push("EXIF");
    if (type === "XMP ") metadata.push("XMP");
    offset += 8 + size + (size % 2);
  }
  return { metadata, broken: offset > end ? "チャンクが途中で切れています" : undefined };
}

const PNG_XMP_KEYWORD = "XML:com.adobe.xmp";
/** ImageMagick などが tEXt / zTXt / iTXt に入れる EXIF / XMP / IPTC（例: "Raw profile type exif"） */
const PNG_RAW_PROFILE = /^Raw profile type (exif|xmp|app1|iptc|8bim)$/i;

/** PNG のチャンクをたどり、eXIf と、XMP などを入れたテキストのチャンクを探す */
function readPngChunks(bytes) {
  const metadata = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    const dataStart = offset + 8;
    if (dataStart + length + 4 > bytes.length) return { metadata, broken: `${type} チャンクが途中で切れています` };
    if (type === "eXIf") metadata.push("EXIF");
    if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
      const keyword = readKeyword(bytes, dataStart, Math.min(dataStart + length, dataStart + 80));
      if (keyword === PNG_XMP_KEYWORD) metadata.push("XMP");
      const raw = PNG_RAW_PROFILE.exec(keyword);
      if (raw) metadata.push(raw[1].toLowerCase() === "xmp" ? "XMP" : raw[1].toUpperCase());
    }
    offset = dataStart + length + 4;
    if (type === "IEND") return { metadata, broken: undefined };
  }
  return { metadata, broken: "IEND チャンクがありません" };
}

const JPEG_EXIF = "Exif\0\0";
const JPEG_XMP = "http://ns.adobe.com/xap/1.0/\0";
const JPEG_XMP_EXTENSION = "http://ns.adobe.com/xmp/extension/\0";

/**
 * JPEG のセグメントをたどり、APP1（EXIF、XMP）と APP13（Photoshop の IRB / IPTC）を探す。
 * SOS の後の圧縮データは、FF 00（エスケープ）と RST（FF D0〜D7）以外のマーカーまで読み飛ばす。EOI（FF D9）が無ければ壊れているとみなす。
 */
function readJpegSegments(bytes) {
  const metadata = [];
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return { metadata, broken: `${offset} バイト目にマーカーがありません` };
    let marker = bytes[offset + 1];
    while (marker === 0xff) marker = bytes[++offset + 1]; // 埋め草の FF
    if (marker === 0xd9) return { metadata, broken: undefined };
    if (marker === undefined) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) break;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const dataStart = offset + 4;
    const next = offset + 2 + length;
    if (length < 2 || next > bytes.length) return { metadata, broken: "セグメントが途中で切れています" };
    if (marker === 0xe1) {
      const head = ascii(bytes, dataStart, Math.min(length - 2, JPEG_XMP_EXTENSION.length));
      if (head.startsWith(JPEG_EXIF)) metadata.push("EXIF");
      if (head.startsWith(JPEG_XMP) || head.startsWith(JPEG_XMP_EXTENSION)) metadata.push("XMP");
    }
    if (marker === 0xed) metadata.push("IPTC");
    offset = next;
    if (marker === 0xda) {
      while (offset + 1 < bytes.length) {
        const following = bytes[offset + 1];
        if (bytes[offset] === 0xff && following !== 0x00 && !(following >= 0xd0 && following <= 0xd7) && following !== 0xff) break;
        offset++;
      }
      if (offset + 1 >= bytes.length) break;
    }
  }
  return { metadata, broken: "EOI（FF D9）がありません" };
}

/** テキストのチャンクの先頭のキーワード（NUL まで、Latin-1） */
function readKeyword(bytes, start, limit) {
  let end = start;
  while (end < limit && bytes[end] !== 0) end++;
  return String.fromCharCode(...bytes.subarray(start, end));
}

function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function startsWith(bytes, prefix) {
  return prefix.every((value, i) => bytes[i] === value);
}

function main() {
  const { dir, configured } = resolveContentDir();
  if (!isDirectory(dir)) {
    if (configured) {
      console.error(`CONTENT_DIR のディレクトリが見つかりません: ${dir}`);
      process.exit(1);
    }
    console.warn(`⚠ content/ が見つからないため、画像の検査をしません: ${dir}`);
    return;
  }
  const { exitCode, stdout, stderr } = formatReport(checkImages(dir), dir);
  for (const line of stderr) console.error(line);
  for (const line of stdout) console.log(line);
  if (exitCode !== 0) process.exit(exitCode);
}

/**
 * 検査の結果から、出す文と終了コードを決める。警告だけなら終了コード 0。
 * @param {ReturnType<typeof checkImages>} result
 * @param {string} dir
 * @returns {{ exitCode: 0 | 1, stdout: string[], stderr: string[] }}
 */
export function formatReport({ errors, warnings, imageCount, referenceCount, totalBytes }, dir) {
  const stderr = warnings.map((warning) => `⚠ ${warning}`);
  if (errors.length > 0) {
    stderr.push(`content/ の画像の検査で ${errors.length} 件のエラーがありました（${dir}）`);
    stderr.push(...errors.map((error) => `  - ${error}`));
    return { exitCode: 1, stdout: [], stderr };
  }
  const summary = `画像 ${imageCount} 枚、本文からの参照 ${referenceCount} 件、画像の合計 ${totalBytes} バイト`;
  return { exitCode: 0, stdout: [`content/ の画像の検査: 問題なし（${summary}）`], stderr };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
