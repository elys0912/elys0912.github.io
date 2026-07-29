// next build の後処理（npm run build から、リポジトリのルートで動かす）。
// 1. 記事が 0 件のときに generateStaticParams が返す仮の slug のページ（PLACEHOLDER_SLUG）を out/ から取り除く
// 2. out/sitemap.xml と out/feed.xml があることを確かめる（無ければビルドを失敗させる）
// 3. content/images/ のうち、公開した記事（out/posts/<slug>/ を出力した記事）から参照されている画像だけを
//    out/images/ にコピーする（本文からは /images/<slug>/xxx.webp で参照する）。
//    下書きや未来の日付の記事からだけ参照されている画像は公開しない。画像の検査は scripts/check-images.mjs で、ここではコピーだけ行う。
//
// content/ はビルド（lib/posts.ts）と同じく、実行したディレクトリの content/ を読む（CONTENT_DIR は使わない）。

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyImages, IMAGES_DIRECTORY, isDirectory, isFile } from "./content-images.mjs";
import { CONTENT_DIRECTORY, PLACEHOLDER_SLUG } from "./content-rules.mjs";

/** 必ず含まれるはずの文字列（sitemap はトップページの URL、フィードは self の link） */
const REQUIRED_OUTPUTS = [
  { name: "sitemap.xml", marker: "<loc>" },
  { name: "feed.xml", marker: '<link rel="self"' },
];

/**
 * 後処理の本体。出力の不足は例外を投げる。
 * @param {{ outDir: string, contentDir: string }} dirs
 * @returns {{ removedPlaceholder: boolean, published: string[], unpublishedOnly: string[], unreferenced: string[] }}
 *   画像の値は "<slug>/<ファイル名>"。published がコピーした画像
 */
export function postbuild({ outDir, contentDir }) {
  const postsOut = path.join(outDir, "posts");

  const placeholder = path.join(postsOut, PLACEHOLDER_SLUG);
  const removedPlaceholder = existsSync(placeholder);
  if (removedPlaceholder) {
    rmSync(placeholder, { recursive: true, force: true });
    if (readdirSync(postsOut).length === 0) rmSync(postsOut, { recursive: true, force: true });
  }

  for (const { name, marker } of REQUIRED_OUTPUTS) {
    const file = path.join(outDir, name);
    const xml = existsSync(file) ? readFileSync(file, "utf8") : "";
    if (!xml.includes(marker)) throw new Error(`out/${name} がないか、${marker} がありません`);
  }

  const images = { published: [], unpublishedOnly: [], unreferenced: [] };
  if (isDirectory(path.join(contentDir, IMAGES_DIRECTORY))) {
    const isPublished = (slug) => isFile(path.join(postsOut, slug, "index.html"));
    Object.assign(images, classifyImages(contentDir, isPublished));
    for (const key of images.published) {
      const target = path.join(outDir, IMAGES_DIRECTORY, ...key.split("/"));
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(path.join(contentDir, IMAGES_DIRECTORY, ...key.split("/")), target);
    }
  }
  return { removedPlaceholder, ...images };
}

function main() {
  let result;
  try {
    result = postbuild({ outDir: path.resolve("out"), contentDir: path.resolve(CONTENT_DIRECTORY) });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const { removedPlaceholder, published, unpublishedOnly, unreferenced } = result;
  if (removedPlaceholder) console.log(`記事が 0 件なので、仮のページ out/posts/${PLACEHOLDER_SLUG}/ を取り除きました`);
  console.log(
    `content/images/ から out/images/ に ${published.length} 枚の画像をコピーしました` +
      `（公開していない記事だけが参照する ${unpublishedOnly.length} 枚、どこからも参照されていない ${unreferenced.length} 枚はコピーしない）`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
