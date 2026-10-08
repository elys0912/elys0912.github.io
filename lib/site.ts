// サイト全体の設定。URL と文言はここにまとめる（変えるときはこのファイルだけを直す）。
// node --test から読み込めるよう、このファイルは値と型だけにする（React やパスの解決が要る import を入れない）。

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
