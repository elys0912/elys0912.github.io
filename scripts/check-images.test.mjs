import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";
import { after, describe, test } from "node:test";
import { checkImages, checkImageSizes, formatReport } from "./check-images.mjs";
import { IMAGES_TOTAL_WARN_BYTES, MAX_IMAGE_BYTES, MAX_IMAGE_BYTES_PER_POST, MAX_IMAGES_PER_POST } from "./content-limits.mjs";
import { classifyImages, extractImageSources } from "./content-images.mjs";

const SCRIPT = fileURLToPath(new URL("./check-images.mjs", import.meta.url));
const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/**
 * 一時ディレクトリに content/ を組み立てる。キーは content/ からの相対パス、値は文字列かバイト列
 * @param {Record<string, string | Uint8Array>} files
 */
function makeContent(files) {
  const root = mkdtempSync(path.join(tmpdir(), "check-images-"));
  roots.push(root);
  for (const [relative, data] of Object.entries(files)) {
    const file = path.join(root, ...relative.split("/"));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, data);
  }
  return root;
}

function post(body, { draft = false } = {}) {
  return [
    "---",
    "title: タイトル",
    "summary: 概要",
    "publishedAt: 2026-10-01T09:00:00+09:00",
    ...(draft ? ["draft: true"] : []),
    "---",
    body,
    "",
  ].join("\n");
}

function u32be(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function u32le(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeAndData = Buffer.concat([Buffer.from(type, "latin1"), data]);
  return Buffer.concat([u32be(data.length), typeAndData, u32be(crc32(typeAndData))]);
}

/** 1×1 のグレースケールの PNG。extra のチャンクを IHDR の後に入れる */
function png(...extra) {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", Buffer.concat([u32be(1), u32be(1), Buffer.from([8, 0, 0, 0, 0])])),
    ...extra,
    pngChunk("IDAT", Buffer.from([0x78, 0x9c, 0x63, 0x60, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01])),
    pngChunk("IEND"),
  ]);
}

function webpChunk(type, data) {
  const padding = data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from(type, "latin1"), u32le(data.length), data, padding]);
}

/** RIFF の構造だけを持つ WebP（VP8L の中身はダミー）。extra のチャンクを後ろに足す */
function webp(...extra) {
  const chunks = Buffer.concat([webpChunk("VP8L", Buffer.from([0x2f, 0, 0, 0, 0x10, 0x07, 0x10, 0x11, 0x11])), ...extra]);
  return Buffer.concat([Buffer.from("RIFF"), u32le(4 + chunks.length), Buffer.from("WEBP"), chunks]);
}

function jpegSegment(marker, data) {
  const length = Buffer.alloc(2);
  length.writeUInt16BE(data.length + 2);
  return Buffer.concat([Buffer.from([0xff, marker]), length, data]);
}

/** セグメントの並びだけを持つ JPEG（圧縮データはダミー）。extra のセグメントを APP0 の後に入れる */
function jpeg(...extra) {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1")),
    ...extra,
    jpegSegment(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])),
    // 圧縮データ。FF 00（エスケープ）と FF D0（RST0）はマーカーではない
    Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56]),
    Buffer.from([0xff, 0xd9]),
  ]);
}

/** EXIF の中身（GPS の IFD を持つ TIFF のヘッダーの最小限） */
const EXIF_PAYLOAD = Buffer.from("Exif\0\0II*\0\x08\0\0\0\x01\0\x25\x88\x04\0\x01\0\0\0\0\0\0\0", "latin1");
const XMP_PAYLOAD = Buffer.from('<x:xmpmeta xmlns:x="adobe:ns:meta/"><exif:GPSLatitude>35,0N</exif:GPSLatitude></x:xmpmeta>');

describe("checkImages", () => {
  test("正常: 記事（下書きを含む）から参照された WebP と PNG", () => {
    const figure = webp();
    const screen = png(pngChunk("tEXt", Buffer.from("Software\0editor", "latin1")));
    const dir = makeContent({
      "blog/first-post.md": post("![図](/images/first-post/figure.webp)"),
      "blog/second-post.md": post('本文\n\n![画面](</images/second-post/screen-1.png> "タイトル")', { draft: true }),
      "images/first-post/figure.webp": figure,
      "images/second-post/screen-1.png": screen,
    });
    assert.deepEqual(checkImages(dir), {
      errors: [],
      warnings: [],
      imageCount: 2,
      referenceCount: 2,
      totalBytes: figure.length + screen.length,
    });
  });

  test(". で始まる名前の .md は記事として数えない（記事の読み込みと同じ。置くこと自体は check-drafts がエラーにする）", () => {
    const dir = makeContent({
      "blog/.hidden.md": post("![図](https://example.com/a.png)"),
      "images/hidden/figure.png": png(),
    });
    const { errors } = checkImages(dir);
    assert.deepEqual(errors, [
      "images/hidden/: blog/ に hidden.md がありません（ディレクトリ名は記事の slug にする）",
      "images/hidden/figure.png: どの記事からも参照されていません（使わない画像は消す）",
    ]);
  });

  test("images/ が無く、本文に画像の参照も無ければ問題なし", () => {
    const dir = makeContent({ "blog/first-post.md": post("本文だけ") });
    assert.deepEqual(checkImages(dir), { errors: [], warnings: [], imageCount: 0, referenceCount: 0, totalBytes: 0 });
  });

  test("blog/ に無い slug のディレクトリはエラー", () => {
    const dir = makeContent({
      "blog/first-post.md": post("![図](/images/unknown-post/figure.png)"),
      "images/unknown-post/figure.png": png(),
    });
    const { errors } = checkImages(dir);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^images\/unknown-post\/: .*unknown-post\.md がありません/);
  });

  test("images/ の直下のファイルと、<slug>/ の中のサブディレクトリはエラー", () => {
    const dir = makeContent({
      "blog/first-post.md": post("本文"),
      "images/stray.png": png(),
      "images/first-post/nested/figure.png": png(),
    });
    const { errors } = checkImages(dir);
    assert.deepEqual(errors, [
      "images/first-post/nested: images/<slug>/ の中にサブディレクトリは置かない",
      "images/stray.png: images/ の直下には <slug>/ のディレクトリだけを置く",
    ]);
  });

  test("正常: JPEG（.jpg と .jpeg、圧縮データ中の FF 00 と RST を読み飛ばす）", () => {
    const a = jpeg();
    // ICC プロファイル（APP2）はメタデータとして扱わない
    const b = jpeg(jpegSegment(0xe2, Buffer.from("ICC_PROFILE\0\x01\x01", "latin1")));
    const dir = makeContent({
      "blog/first-post.md": post("![a](/images/first-post/a.jpg)\n![b](/images/first-post/b.jpeg)"),
      "images/first-post/a.jpg": a,
      "images/first-post/b.jpeg": b,
    });
    assert.deepEqual(checkImages(dir), {
      errors: [],
      warnings: [],
      imageCount: 2,
      referenceCount: 2,
      totalBytes: a.length + b.length,
    });
  });

  test("EXIF / XMP / IPTC の入った JPEG はエラー（位置情報の理由を出す）", () => {
    const dir = makeContent({
      "blog/first-post.md": post(["exif", "xmp", "iptc"].map((name) => `![${name}](/images/first-post/${name}.jpg)`).join("\n")),
      "images/first-post/exif.jpg": jpeg(jpegSegment(0xe1, EXIF_PAYLOAD)),
      "images/first-post/xmp.jpg": jpeg(
        jpegSegment(0xe1, Buffer.concat([Buffer.from("http://ns.adobe.com/xap/1.0/\0", "latin1"), XMP_PAYLOAD])),
      ),
      "images/first-post/iptc.jpg": jpeg(jpegSegment(0xed, Buffer.from("Photoshop 3.0\x008BIM\x04\x04\0\0\0\0\0\0", "latin1"))),
    });
    const reason = "が入っています。GPS などの位置情報が残りうるため、置く前に除去する";
    assert.deepEqual(checkImages(dir).errors, [
      `images/first-post/exif.jpg: メタデータ（EXIF）${reason}`,
      `images/first-post/iptc.jpg: メタデータ（IPTC）${reason}`,
      `images/first-post/xmp.jpg: メタデータ（XMP）${reason}`,
    ]);
  });

  test("EOI（FF D9）の無い JPEG はエラー", () => {
    const full = jpeg();
    const dir = makeContent({
      "blog/first-post.md": post("![a](/images/first-post/broken.jpg)"),
      "images/first-post/broken.jpg": full.subarray(0, full.length - 2),
    });
    assert.deepEqual(checkImages(dir).errors, ["images/first-post/broken.jpg: JPEG として読めません: EOI（FF D9）がありません"]);
  });

  test("WebP、PNG、JPEG のどれでもないファイルと、中身と合わない拡張子はエラー", () => {
    const dir = makeContent({
      "blog/first-post.md": post(
        "![a](/images/first-post/a.gif)\n![b](/images/first-post/b.webp)\n![c](/images/first-post/c.png)",
      ),
      "images/first-post/a.gif": Buffer.from("GIF89a\x01\0\x01\0", "latin1"),
      "images/first-post/b.webp": png(),
      "images/first-post/c.png": jpeg(),
    });
    const { errors } = checkImages(dir);
    assert.deepEqual(errors, [
      "images/first-post/a.gif: WebP、PNG、JPEG のどれでもありません（ファイルの中身で判定しています）",
      "images/first-post/b.webp: 中身は PNG なので、拡張子を .png にする",
      "images/first-post/c.png: 中身は JPEG なので、拡張子を .jpg か .jpeg にする",
    ]);
  });

  test("500KB を超える画像はエラー（ちょうどなら通る）", () => {
    const overhead = png(pngChunk("tEXt", Buffer.alloc(0))).length;
    const padded = (size) => png(pngChunk("tEXt", Buffer.alloc(size - overhead, 0x61)));
    assert.equal(padded(MAX_IMAGE_BYTES).length, MAX_IMAGE_BYTES);
    const dir = makeContent({
      "blog/first-post.md": post("![a](/images/first-post/limit.png)\n![b](/images/first-post/large.png)"),
      "images/first-post/limit.png": padded(MAX_IMAGE_BYTES),
      "images/first-post/large.png": padded(MAX_IMAGE_BYTES + 1),
    });
    const { errors } = checkImages(dir);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^images\/first-post\/large\.png: 512001 バイトあります。1 枚 512000 バイト（500KB）まで/);
  });

  test("EXIF / XMP のメタデータが入った WebP と PNG はエラー", () => {
    const dir = makeContent({
      "blog/first-post.md": post(
        ["exif.webp", "xmp.webp", "exif.png", "xmp.png", "raw.png"].map((name) => `![${name}](/images/first-post/${name})`).join("\n"),
      ),
      "images/first-post/exif.webp": webp(webpChunk("EXIF", EXIF_PAYLOAD)),
      "images/first-post/xmp.webp": webp(webpChunk("XMP ", XMP_PAYLOAD)),
      "images/first-post/exif.png": png(pngChunk("eXIf", EXIF_PAYLOAD.subarray(6))),
      "images/first-post/xmp.png": png(
        pngChunk("iTXt", Buffer.concat([Buffer.from("XML:com.adobe.xmp\0\0\0\0\0", "latin1"), XMP_PAYLOAD])),
      ),
      "images/first-post/raw.png": png(pngChunk("zTXt", Buffer.from("Raw profile type exif\0\0x", "latin1"))),
    });
    const { errors } = checkImages(dir);
    const reason = "が入っています。GPS などの位置情報が残りうるため、置く前に除去する";
    assert.deepEqual(errors, [
      `images/first-post/exif.png: メタデータ（EXIF）${reason}`,
      `images/first-post/exif.webp: メタデータ（EXIF）${reason}`,
      `images/first-post/raw.png: メタデータ（EXIF）${reason}`,
      `images/first-post/xmp.png: メタデータ（XMP）${reason}`,
      `images/first-post/xmp.webp: メタデータ（XMP）${reason}`,
    ]);
  });

  test("途中で切れた PNG はエラー", () => {
    const broken = png().subarray(0, 40);
    const dir = makeContent({
      "blog/first-post.md": post("![a](/images/first-post/broken.png)"),
      "images/first-post/broken.png": broken,
    });
    const { errors } = checkImages(dir);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^images\/first-post\/broken\.png: PNG として読めません/);
  });

  test("/images/ 以外の参照（外部の URL、data:、相対パス、階層違い）はエラー", () => {
    const dir = makeContent({
      "blog/first-post.md": post(
        [
          "![a](https://example.com/a.png)",
          "![b](//example.com/b.png)",
          "![c](data:image/png;base64,AAAA)",
          "![d](images/first-post/d.png)",
          '<img src="/images/first-post/sub/e.png">',
          "![f](/images/first-post/f.png?v=1)",
        ].join("\n"),
      ),
    });
    const { errors } = checkImages(dir);
    assert.equal(errors.length, 6);
    assert.match(errors[0], /^blog\/first-post\.md:6: .*（外部の URL は使わない）: https:\/\/example\.com\/a\.png$/);
    assert.match(errors[1], /^blog\/first-post\.md:7: .*（外部の URL は使わない）/);
    assert.match(errors[2], /^blog\/first-post\.md:8: .*（data: URL は使わない）/);
    assert.match(errors[3], /^blog\/first-post\.md:9: .*（相対パスは使わない）/);
    assert.match(errors[4], /^blog\/first-post\.md:10: .*2 階層で書く/);
    assert.match(errors[5], /^blog\/first-post\.md:11: .*2 階層で書く/);
  });

  test("どの記事からも参照されていない画像はエラー", () => {
    const dir = makeContent({
      "blog/first-post.md": post("![使う](/images/first-post/used.png)"),
      "images/first-post/used.png": png(),
      "images/first-post/unused.png": png(),
    });
    assert.deepEqual(checkImages(dir).errors, ["images/first-post/unused.png: どの記事からも参照されていません（使わない画像は消す）"]);
  });

  test("存在しない画像への参照はエラー", () => {
    const dir = makeContent({
      "blog/first-post.md": post("![無い](/images/first-post/missing.png)"),
    });
    assert.deepEqual(checkImages(dir).errors, [
      "blog/first-post.md:6: 参照先の画像がありません: /images/first-post/missing.png（content/images/first-post/missing.png）",
    ]);
  });
});

describe("checkImageSizes", () => {
  test("1 記事 40 枚までは通り、41 枚はエラー", () => {
    const sizes = new Map([
      ["forty", Array(MAX_IMAGES_PER_POST).fill(1)],
      ["forty-one", Array(MAX_IMAGES_PER_POST + 1).fill(1)],
    ]);
    assert.deepEqual(checkImageSizes(sizes), {
      errors: ["images/forty-one/: 画像が 41 枚あります。1 記事 40 枚までにする（記事を分ける）"],
      warnings: [],
      totalBytes: MAX_IMAGES_PER_POST * 2 + 1,
    });
  });

  test("1 記事の合計はちょうど 5MB なら通り、1 バイト超えるとエラー", () => {
    const sizes = new Map([
      ["limit", [MAX_IMAGE_BYTES_PER_POST - 100, 100]],
      ["over", [MAX_IMAGE_BYTES_PER_POST - 100, 101]],
    ]);
    const { errors, warnings } = checkImageSizes(sizes);
    assert.deepEqual(errors, [
      "images/over/: 画像の合計が 5242881 バイトあります。1 記事 5242880 バイト（5MB）までにする（縮小・圧縮するか、記事を分ける）",
    ]);
    assert.deepEqual(warnings, []);
  });

  test("content/images/ の合計が 300MB を超えると警告するが、エラーにはせず終了コード 0", () => {
    // 1 記事 5MB（上限ちょうど）の記事が 60 本でちょうど 300MB。ここまでは警告しない
    const sizes = new Map(Array.from({ length: 60 }, (_, i) => [`post-${i}`, [MAX_IMAGE_BYTES_PER_POST]]));
    assert.equal(MAX_IMAGE_BYTES_PER_POST * 60, IMAGES_TOTAL_WARN_BYTES);
    assert.deepEqual(checkImageSizes(sizes), { errors: [], warnings: [], totalBytes: IMAGES_TOTAL_WARN_BYTES });

    sizes.set("one-more", [1]);
    const result = checkImageSizes(sizes);
    assert.deepEqual(result.errors, []);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /^content\/images\/ の合計が 314572801 バイトあり、314572800 バイト（300MB）を超えています/);

    const report = formatReport({ ...result, imageCount: 61, referenceCount: 61 }, "content");
    assert.equal(report.exitCode, 0);
    assert.deepEqual(report.stderr, [`⚠ ${result.warnings[0]}`]);
    assert.deepEqual(report.stdout, [
      "content/ の画像の検査: 問題なし（画像 61 枚、本文からの参照 61 件、画像の合計 314572801 バイト）",
    ]);
  });
});

describe("extractImageSources", () => {
  test("frontmatter、コードブロック、インラインのコード、HTML のコメントの中は拾わない", () => {
    const text = [
      "---",
      "title: ![x](/images/a/front.png)",
      "---",
      "```md",
      "![x](/images/a/fenced.png)",
      "```",
      "  ~~~",
      "  ![x](/images/a/tilde.png)",
      "  ~~~",
      "`![x](/images/a/inline.png)` と ``![x](/images/a/double.png)``",
      "<!-- ![x](/images/a/comment.png)",
      "-->",
      "![拾う](/images/a/real.png)",
    ].join("\n");
    assert.deepEqual(extractImageSources(text), [{ src: "/images/a/real.png", line: 13 }]);
  });

  test("参照形式、<img>、タイトル付き、CRLF の行番号", () => {
    const text = [
      "![full][fig]",
      "![collapsed][]",
      "![Shortcut]",
      "![no-definition][missing]",
      "<IMG alt='x' src='/images/a/html.png'>",
      '![title](/images/a/title.png "タイトル")',
      "[fig]: /images/a/full.png",
      "[collapsed]: </images/a/collapsed.png>",
      "[shortcut]: /images/a/shortcut.png",
    ].join("\r\n");
    assert.deepEqual(extractImageSources(text), [
      { src: "/images/a/full.png", line: 1 },
      { src: "/images/a/collapsed.png", line: 2 },
      { src: "/images/a/shortcut.png", line: 3 },
      { src: "/images/a/html.png", line: 5 },
      { src: "/images/a/title.png", line: 6 },
    ]);
  });

  test("リンク（! の無いもの）は拾わない", () => {
    assert.deepEqual(extractImageSources("[画像へのリンク](/images/a/link.png)"), []);
  });

  test("Marp の記事は、frontmatter と HTML のコメントの中も含めて、コードの外の url(…) と @import を拾う", () => {
    const text = [
      "---",
      "marp: true",
      "style: |",
      "  section { background: url(https://example.com/a.png) }",
      "  @import 'https://example.com/theme.css';",
      "---",
      "",
      "<!-- _backgroundImage: url(\"/images/deck/bg.png\") -->",
      "",
      "```css",
      "url(https://example.com/in-code.png)",
      "```",
      "`url(https://example.com/inline.png)` と url(#svg-id)",
    ].join("\n");
    assert.deepEqual(extractImageSources(text), [
      { src: "https://example.com/a.png", line: 4 },
      { src: "https://example.com/theme.css", line: 5 },
      { src: "/images/deck/bg.png", line: 8 },
    ]);
  });

  test("Marp でない記事の url(…) は拾わない（本文の文字として表示されるだけ）", () => {
    assert.deepEqual(extractImageSources("---\ntitle: t\n---\nurl(https://example.com/a.png)"), []);
  });
});

describe("classifyImages", () => {
  test("公開した記事から参照される画像、公開していない記事からだけ参照される画像、未参照の画像に分ける", () => {
    const dir = makeContent({
      "blog/public-post.md": post("![a](/images/public-post/shared.png)\n```\n![x](/images/public-post/in-code.png)\n```"),
      "blog/draft-post.md": post("![a](/images/public-post/shared.png)\n![b](/images/draft-post/draft-only.png)", {
        draft: true,
      }),
      "images/public-post/shared.png": png(),
      "images/public-post/in-code.png": png(),
      "images/draft-post/draft-only.png": png(),
    });
    // 公開したかどうかは呼び出し側が決める（postbuild はビルドが出力したページで判定する）
    assert.deepEqual(
      classifyImages(dir, (slug) => slug === "public-post"),
      {
        published: ["public-post/shared.png"],
        unpublishedOnly: ["draft-post/draft-only.png"],
        unreferenced: ["public-post/in-code.png"],
      },
    );
  });
});

describe("コマンド", () => {
  const run = (env) =>
    spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, ...env }, encoding: "utf8" });

  test("問題が無ければ終了コード 0 で枚数を出す", () => {
    const dir = makeContent({
      "blog/first-post.md": post("![図](/images/first-post/figure.png)"),
      "images/first-post/figure.png": png(),
    });
    const result = run({ CONTENT_DIR: dir });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`画像 1 枚、本文からの参照 1 件、画像の合計 ${png().length} バイト`));
  });

  test("エラーがあればまとめて出し、終了コード 1", () => {
    const dir = makeContent({
      "blog/first-post.md": post("![a](https://example.com/a.png)\n![b](/images/first-post/missing.png)"),
      "images/first-post/unused.png": png(),
    });
    const result = run({ CONTENT_DIR: dir });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /3 件のエラー/);
  });

  test("CONTENT_DIR で指定したディレクトリが無ければ終了コード 1", () => {
    const result = run({ CONTENT_DIR: path.join(tmpdir(), "check-images-does-not-exist") });
    assert.equal(result.status, 1);
  });
});
