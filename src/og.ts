// 記事ごとの OGP 画像（out/og/<slug>.png、1200×630）。SNS で共有されたときに、記事のタイトルが入った画像を出すため。
// タイトルを入れた HTML を一時ファイルに書き、ヘッドレスの Chrome で 1 枚ずつ撮る。src/build.ts が書き出しの途中で呼ぶ。
// 1 枚ごとに Chrome を起動するので（1 回 1 秒ほど）、いくつかを同時に動かす。
//
// Chrome は、環境変数 CHROME_PATH があればそれを、無ければ OS ごとの既定の場所（DEFAULT_CHROME_PATHS）を使う。
// 文字は Chrome が動く環境の書体で描く。日本語の書体が無い環境（GitHub Actions の ubuntu の初期状態）では文字が出ないので、
// ワークフローで書体を入れてからビルドする（.github/workflows/）。

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import type { PostContent } from "../shared/lib/post-types.ts";
import { OG_IMAGE, ogImagePath, SITE_NAME } from "./site.ts";

/** Chrome の実行ファイルの既定の場所。linux は PATH から探す（GitHub Actions の ubuntu に入っている名前） */
const DEFAULT_CHROME_PATHS: Partial<Record<NodeJS.Platform, string>> = {
  win32: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  linux: "google-chrome",
};

const CHROME_PATH_ENV = "CHROME_PATH";

/** 1 枚を撮る時間の上限。固まった Chrome でビルドが止まり続けないようにする */
const SCREENSHOT_TIMEOUT_MS = 60_000;

/** 同時に動かす Chrome の数。GitHub Actions のランナー（4 コア）で詰まらない数にする */
const CONCURRENT_SCREENSHOTS = 4;

const execFileAsync = promisify(execFile);

/** 全記事の OGP 画像を outDir の下（ogImagePath の場所）に書く。Chrome が無い、撮れないときは例外を投げる */
export async function writeOgImages(posts: readonly PostContent[], outDir: string): Promise<void> {
  const chromePath = process.env[CHROME_PATH_ENV] ?? DEFAULT_CHROME_PATHS[process.platform];
  if (chromePath === undefined) {
    throw new Error(`OGP 画像を作る Chrome の場所が分かりません。${CHROME_PATH_ENV} に実行ファイルを指定する`);
  }

  const workDir = mkdtempSync(path.join(tmpdir(), "blog-og-"));
  try {
    const takePostScreenshot = (post: PostContent) => {
      const htmlFile = path.join(workDir, `${post.slug}.html`);
      const imageFile = path.join(outDir, ...ogImagePath(post.slug).split("/").filter(Boolean));
      writeFileSync(htmlFile, ogImageHtml(post.title));
      mkdirSync(path.dirname(imageFile), { recursive: true });

      return takeScreenshot(chromePath, htmlFile, imageFile);
    };

    for (let first = 0; first < posts.length; first += CONCURRENT_SCREENSHOTS) {
      await Promise.all(posts.slice(first, first + CONCURRENT_SCREENSHOTS).map(takePostScreenshot));
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/** htmlFile を OGP 画像の大きさの画面で開き、imageFile に PNG で保存する */
async function takeScreenshot(chromePath: string, htmlFile: string, imageFile: string): Promise<void> {
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--window-size=${OG_IMAGE.width},${OG_IMAGE.height}`,
    `--screenshot=${imageFile}`,
    // GitHub Actions のランナーでは、Chrome のサンドボックスが使えずに起動できないことがある。開くのは自分で書いた HTML だけ
    ...(process.platform === "linux" ? ["--no-sandbox"] : []),
    pathToFileURL(htmlFile).href,
  ];

  try {
    await execFileAsync(chromePath, args, { timeout: SCREENSHOT_TIMEOUT_MS });
  } catch (error) {
    throw new Error(`OGP 画像を作れません。Chrome を入れるか、${CHROME_PATH_ENV} に実行ファイルを指定する（今の指定：${chromePath}）`, {
      cause: error,
    });
  }
  // Chrome は、保存に失敗しても終了コード 0 で終わることがある
  if (!existsSync(imageFile)) throw new Error(`OGP 画像が書き出されませんでした: ${imageFile}`);
}

/**
 * OGP 画像にする HTML。色はサイトの配色（shared/app/globals.css）と同じ値。
 * タイトルは 4 行まで出し、収まらない分は末尾を「…」にする
 */
export function ogImageHtml(title: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    display: flex;
    flex-direction: column;
    width: ${OG_IMAGE.width}px;
    height: ${OG_IMAGE.height}px;
    padding: 72px 80px 56px;
    border-top: 16px solid #ffe100;
    background: #0d1210;
    color: #f1f3f2;
    font-family: "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic UI", "Hiragino Sans", sans-serif;
  }
  h1 {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    margin: 0;
    overflow: hidden;
    font-size: 60px;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  p { margin: auto 0 0; color: #a9b3ad; font-size: 32px; }
</style>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(SITE_NAME)}</p>
</html>
`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
