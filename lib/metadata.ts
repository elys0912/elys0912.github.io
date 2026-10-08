import type { Metadata } from "next";
// node --test から読み込めるよう、拡張子付きで import する
import { FEED_PATH } from "./paths.ts";
import { SITE_NAME, SITE_URL } from "./site.ts";

type PageMetadataOptions = {
  /** 省略するとサイト名だけのタイトルになる（トップページ） */
  title?: string;
  description: string;
  /** ページのパス（例：/posts/first-post/）。og:url と canonical に使う */
  path: string;
  /** 記事の詳細ページ（og:type=article）のときに渡す */
  article?: { publishedTime: string; updatedTime: string };
};

// サイト全体の OGP 画像（public/ に置く静的ファイル）。記事ごとの画像は無い。
// app/opengraph-image.png（Next の規約ファイル）にすると、ページで openGraph を書いたときに消えるので使わない
const OG_IMAGE = { path: "/opengraph-image.png", width: 1200, height: 630, alt: SITE_NAME };

// Next のメタデータは浅くマージされ、ページで openGraph を書くと layout の openGraph は丸ごと置き換わる。
// そのため og: と twitter: は、ページごとにこの関数で一式そろえて返す。
export function pageMetadata(options: PageMetadataOptions): Metadata {
  return buildPageMetadata(options, SITE_URL);
}

/**
 * pageMetadata の本体。テストでサイトの URL を差し替えられるよう、引数で受け取る。
 * path を省略すると og:url と canonical を出さない（layout の既定値用。404 などに canonical を継承させない）
 */
export function buildPageMetadata(
  { title, description, path, article }: Omit<PageMetadataOptions, "path"> & { path?: string },
  baseUrl: URL,
): Metadata {
  // <title> には layout の title.template が効くが、og:title には効かないので自分で組み立てる
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const url = path !== undefined ? new URL(path, baseUrl).toString() : undefined;
  const image = {
    url: new URL(OG_IMAGE.path, baseUrl).toString(),
    width: OG_IMAGE.width,
    height: OG_IMAGE.height,
    alt: OG_IMAGE.alt,
  };

  return {
    ...(title && { title }),
    description,
    // alternates も浅くマージされるので、canonical と一緒にフィードの <link rel="alternate"> も入れる
    alternates: { ...(url && { canonical: url }), types: feedAlternateTypes(baseUrl) },
    openGraph: {
      title: fullTitle,
      description,
      siteName: SITE_NAME,
      locale: "ja_JP",
      ...(url && { url }),
      images: [image],
      ...(article
        ? {
            type: "article",
            publishedTime: article.publishedTime,
            // 公開後に更新したときだけ入れる
            ...(Date.parse(article.updatedTime) > Date.parse(article.publishedTime) && {
              modifiedTime: article.updatedTime,
            }),
          }
        : { type: "website" }),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [image],
    },
  };
}

/** フィード（/feed.xml）を指す <link rel="alternate" type="application/atom+xml"> の指定 */
export function feedAlternateTypes(baseUrl: URL): NonNullable<Metadata["alternates"]>["types"] {
  return { "application/atom+xml": [{ url: new URL(FEED_PATH, baseUrl).toString(), title: SITE_NAME }] };
}
