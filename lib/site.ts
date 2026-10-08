// サイト全体の設定。URL と文言はここにまとめる（変えるときはこのファイルだけを直す）。
// node --test から読み込めるよう、このファイルは値と型だけにする（React やパスの解決が要る import を入れない）。

/**
 * サイトの URL（オリジンだけ。末尾の / まで）。canonical、OGP、sitemap.xml、feed.xml の絶対 URL に使う。
 * 独自ドメインに移すときはここを変える
 */
export const SITE_URL = new URL("https://elys0912.github.io/");

/** サイト名。<title> の後ろ、og:site_name、フィードの title に使う（仮） */
export const SITE_NAME = "elys0912.github.io";

/** サイトの説明。description、フィードの subtitle に使う（仮） */
export const SITE_DESCRIPTION = "技術ブログ";

/** 著者名。フィードの author と、フッターの著作権の表示に使う */
export const AUTHOR_NAME = "elys0912";

/** 記事一覧（トップページ）の見出しと説明、記事が無いときの文言（仮） */
export const POST_LIST_TITLE = "記事一覧";
export const POST_LIST_LEAD = "作りながら書いた技術メモ。";
export const POST_LIST_EMPTY_TEXT = "記事はまだありません。";

/** ヘッダーのナビの項目（仮）。href は末尾を / にしたサイト内のパス */
export const NAV_ITEMS: readonly { href: string; label: string }[] = [{ href: "/", label: "記事一覧" }];

/** フッターの著作権の表示の後ろに置くリンク（仮）。記事のライセンスを案内する */
export const FOOTER_LINKS: readonly { href: string; label: string }[] = [
  {
    href: "https://github.com/elys0912/elys0912.github.io/blob/main/content/LICENSE.md",
    label: "記事のライセンス",
  },
];
