// 記事と画像のサイズの上限。依存なし。
// 本文の上限は lib/posts.ts（ビルド）と scripts/check-drafts.mjs が、画像の上限は scripts/check-images.mjs が検査する。

/** 本文（Marp の記事は先頭に残す frontmatter を含む）の UTF-8 のバイト数（128KB） */
export const MAX_BODY_BYTES = 128 * 1024;

/** 画像 1 枚のバイト数（500KB） */
export const MAX_IMAGE_BYTES = 500 * 1024;

/** 1 記事（content/images/<slug>/）の画像の枚数 */
export const MAX_IMAGES_PER_POST = 40;

/** 1 記事（content/images/<slug>/）の画像の合計のバイト数（5MB） */
export const MAX_IMAGE_BYTES_PER_POST = 5 * 1024 * 1024;

/** content/images/ の合計がこのバイト数（300MB）を超えたら警告する（エラーにはしない） */
export const IMAGES_TOTAL_WARN_BYTES = 300 * 1024 * 1024;
