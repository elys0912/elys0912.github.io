// サイト全体の設定と、サイト内のパス。URL と文言はここにまとめる（変えるときはこのファイルだけを直す）。

/**
 * サイトの URL（オリジンだけ。末尾の / まで）。canonical、OGP、sitemap.xml、feed.xml の絶対 URL に使う。
 * 独自ドメインに移すときはここを変える
 */
export const SITE_URL = new URL("https://elys0912.github.io/");

/** サイト名。<title> の後ろ、og:site_name、フィードの title に使う。名前はここだけに書く（ほかの場所に直書きしない） */
export const SITE_NAME = "零時雑記";

/** サイトの説明。description、フィードの subtitle、記事一覧の説明に使う */
export const SITE_DESCRIPTION = "作りながら書く雑記。技術の話も、サッカーも音楽も趣味も詰めこんでいく。";

/** 著者名。フィードの author と、フッターの著作権の表示に使う */
export const AUTHOR_NAME = "elys0912";

/** 記事一覧（トップページ）の見出しと説明、記事が無いときの文言。見出しはナビと「〜へ戻る」にも使う */
export const POST_LIST_TITLE = "雑記";
export const POST_LIST_LEAD = SITE_DESCRIPTION;
export const POST_LIST_EMPTY_TEXT = "なんもない";

/** ヘッダーのナビの項目。href は末尾を / にしたサイト内のパス */
export const NAV_ITEMS: readonly { href: string; label: string }[] = [{ href: "/", label: POST_LIST_TITLE }];

/** フッターの著作権の表示の後ろに置くリンク（仮）。記事のライセンスを案内する */
export const FOOTER_LINKS: readonly { href: string; label: string }[] = [
  {
    href: "https://github.com/elys0912/elys0912.github.io/blob/main/content/LICENSE.md",
    label: "記事のライセンス",
  },
];

/**
 * フッターの「前のページへ戻る」の文言。portfolio へ戻る仮の導線（src/client.js が履歴があるときだけ出す）。
 * TODO: portfolio の独自ドメインができたら、FOOTER_LINKS に portfolio へのリンクを足し、これとボタンを消す
 */
export const HISTORY_BACK_LABEL = "前のページへ戻る";

/** サイト全体の OGP 画像（public/ に置く静的ファイル）。記事ごとの画像は無い */
export const OG_IMAGE = { path: "/opengraph-image.png", width: 1200, height: 630, alt: SITE_NAME };

/** 記事一覧（トップページ） */
export const HOME_PATH = "/";

/** Atom フィード */
export const FEED_PATH = "/feed.xml";

/** 記事の詳細ページ（/posts/<slug>/） */
export function postPath(slug: string): string {
  return `/posts/${encodeURIComponent(slug)}/`;
}

/** サイト内のパスを絶対 URL にする */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}
