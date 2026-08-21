// サイト全体の設定と、サイト内のパス。URL と文言はここにまとめる（変えるときはこのファイルだけを直す）。

/**
 * サイトの URL（オリジンだけ。末尾の / まで）。canonical、OGP、sitemap.xml、feed.xml の絶対 URL に使う。
 * 独自ドメインに移すときはここを変える
 */
export const SITE_URL = new URL("https://elys0912.github.io/");

/** サイト名。<title> の後ろ、og:site_name、フィードの title に使う。名前はここだけに書く（ほかの場所に直書きしない） */
export const SITE_NAME = "零時雑記";

/** サイトの説明。description、フィードの subtitle、記事一覧の説明に使う */
export const SITE_DESCRIPTION = "作ったもの、ハマったこと、見た試合。なんでも書くとされる（？）";

/** 著者名。フィードの author と、フッターの著作権の表示に使う */
export const AUTHOR_NAME = "elys0912";

/** 記事一覧（トップページ）の見出しと説明、記事が無いときの文言。見出しはナビと「〜へ戻る」にも使う */
export const POST_LIST_TITLE = "雑記";
export const POST_LIST_LEAD = SITE_DESCRIPTION;
export const POST_LIST_EMPTY_TEXT = "なんもない";

/** ナビ・サイドバー・フッターに並べるリンク */
export type SiteLink = { href: string; label: string };

/** ヘッダーのナビの項目。href は末尾を / にしたサイト内のパス */
export const NAV_ITEMS: readonly SiteLink[] = [
  { href: "/", label: POST_LIST_TITLE },
  { href: "/tags/", label: "タグ" },
];

/** サイドバーのプロフィールの一言 */
export const PROFILE_BIO = "自称エンジニア　好きなものはゲームとお酒とタバコ、あとサッカー";

/** サイドバーのプロフィールのアイコン（public/ に置く静的ファイル。180x180 を縮めて出す） */
export const PROFILE_ICON = { path: "/apple-icon.png", size: 56 };

/** portfolio へのリンク（サイドバーのプロフィールとフッターで使う） */
const PORTFOLIO_LINK: SiteLink = { href: "https://elysdev.net/", label: "ポートフォリオ" };

/** サイドバーのプロフィールの下に並べるリンク */
export const PROFILE_LINKS: readonly SiteLink[] = [
  { href: "https://github.com/elys0912", label: "GitHub" },
  PORTFOLIO_LINK,
];

/** サイドバーの「最近の記事」に出す件数 */
export const RECENT_POSTS_COUNT = 5;

/** 月別の一覧ページの見出し（<title> にも使う）と説明。month は「2026-10」（yyyy-MM） */
export function archiveTitle(month: string): string {
  return `${month} の記事`;
}

export function archiveDescription(month: string): string {
  return `${month} に公開した記事の一覧`;
}

/**
 * タグの見出し。サイドバーの区画、記事のチップの aria-label にも使う。
 * タグの一覧ページ（/tags/）は見出し（<title> にも使う）と説明、タグが 1 つも無いときの文言
 */
export const TAGS_TITLE = "タグ";
export const TAG_INDEX_DESCRIPTION = "記事に付けたタグの一覧";
export const TAG_INDEX_EMPTY_TEXT = "まだタグがない";

/** タグごとの一覧ページの見出し（<title> にも使う）と説明 */
export function tagTitle(tag: string): string {
  return `${TAGS_TITLE}: ${tag}`;
}

export function tagDescription(tag: string): string {
  return `タグ「${tag}」を付けた記事の一覧`;
}

/** フッターの著作権の表示の後ろに置くリンク。記事のライセンスの案内と、portfolio */
export const FOOTER_LINKS: readonly SiteLink[] = [
  {
    href: "https://github.com/elys0912/elys0912.github.io/blob/main/content/LICENSE.md",
    label: "記事のライセンス",
  },
  PORTFOLIO_LINK,
];

/** サイト全体の OGP 画像（public/ に置く静的ファイル）。記事ごとの画像は無い */
export const OG_IMAGE = { path: "/opengraph-image.png", width: 1200, height: 630, alt: SITE_NAME };

/**
 * Content-Security-Policy。GitHub Pages は応答ヘッダーを付けられないため、全ページの <meta http-equiv> で出す。
 * 由来は portfolio が CloudFront の応答ヘッダーで付けている CSP。違いは次の 3 点。
 * - frame-ancestors は外す。meta では無視される（report-uri と sandbox も同じ）
 * - script-src の 'unsafe-inline' は外す。inline の script は無い（site.js と marp-browser.js は外部ファイル。Marp は script: false）
 * - img-src に https: を足す。記事の Markdown の画像（shared/lib/markdown.ts の sanitize が src の https を許可）と Marp の画像は外部の URL を指せる
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // Marp の記事のテーマの <style> と、Marp の HTML の style 属性
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/** 記事一覧（トップページ） */
export const HOME_PATH = "/";

/** Atom フィード */
export const FEED_PATH = "/feed.xml";

/** 記事の詳細ページ（/posts/<slug>/） */
export function postPath(slug: string): string {
  return `/posts/${encodeURIComponent(slug)}/`;
}

/** 月別の一覧ページ（/archive/<yyyy>/<mm>/）。month は「2026-10」（yyyy-MM） */
export function archivePath(month: string): string {
  const [year, monthNumber] = month.split("-");

  return `/archive/${year}/${monthNumber}/`;
}

/** タグの一覧ページ */
export const TAG_INDEX_PATH = "/tags/";

/** タグごとの一覧ページ（/tags/<タグ>/）。タグは encodeURIComponent（日本語も %E3… になる） */
export function tagPath(tag: string): string {
  return `${TAG_INDEX_PATH}${encodeURIComponent(tag)}/`;
}

/** サイト内のパスを絶対 URL にする */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}
