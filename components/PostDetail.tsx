import Link from "next/link";
import { formatDate } from "@/lib/format";
import { renderMarkdownWithHeadings } from "@/lib/markdown";
import { isMarpMarkdown, renderMarp } from "@/lib/marp";
import type { PostContent } from "@/lib/post-types";
import { MarpDeck } from "./MarpDeck";
import styles from "./PostDetail.module.css";
import { TableOfContents } from "./TableOfContents";

/** 見出しの下に置く主ボタン（外部へのリンク）。1 ページに 1 つだけ */
export type PrimaryLink = { href: string; label: string };

/**
 * 記事の詳細。パンくず、日付、タイトル、要約、（渡せば）主ボタン、本文。
 * 本文に h2 があれば、PC では右に目次を置き、900px 以下では本文の上にチップで並べる。
 */
export function PostDetail({
  post,
  listLabel,
  backHref,
  backLabel,
  primaryLink,
}: {
  post: PostContent;
  /** パンくずの一覧の名前（リンク先は backHref） */
  listLabel: string;
  backHref: string;
  backLabel: string;
  primaryLink?: PrimaryLink;
}) {
  const publishedDate = formatDate(post.publishedAt);
  const updatedDate = formatDate(post.updatedAt);
  // 日本時間で公開日と違う日に更新したときだけ出す。予約公開では updatedAt が
  // publishedAt より前になり得るので、公開後の更新に限る
  const showUpdated =
    updatedDate !== publishedDate && Date.parse(post.updatedAt) > Date.parse(post.publishedAt);

  const marp = isMarpMarkdown(post.bodyMarkdown);
  const { html, headings } = marp ? { html: "", headings: [] } : renderMarkdownWithHeadings(post.bodyMarkdown);
  const hasToc = headings.length > 0;

  return (
    <article className={`${styles.layout} ${hasToc ? styles.withToc : ""}`}>
      <header className={styles.header}>
        <nav aria-label="パンくずリスト">
          <ol className={styles.breadcrumb}>
            <li>
              <Link href={backHref}>{listLabel}</Link>
            </li>
            <li aria-current="page">{post.title}</li>
          </ol>
        </nav>
        <p className={styles.dates}>
          {post.draft && <span className={styles.draft}>下書き</span>}
          <span>
            公開日 <time dateTime={post.publishedAt}>{publishedDate}</time>
          </span>
          {showUpdated && (
            <span>
              更新日 <time dateTime={post.updatedAt}>{updatedDate}</time>
            </span>
          )}
        </p>
        <h1 className={styles.title}>{post.title}</h1>
        <p className={styles.summary}>{post.summary}</p>
        {primaryLink && (
          <a className={styles.primaryButton} href={primaryLink.href} rel="noopener noreferrer">
            {primaryLink.label}
          </a>
        )}
      </header>

      {hasToc && (
        <aside className={styles.aside}>
          <TableOfContents headings={headings} />
        </aside>
      )}

      <div className={styles.content}>
        {marp ? (
          <MarpDeck {...renderMarp(post.bodyMarkdown)} />
        ) : (
          <div
            className={styles.body}
            // renderMarkdownWithHeadings が許可リストでサニタイズした HTML なので、そのまま埋め込んでよい
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
        <footer className={styles.footer}>
          <p>
            <Link className={styles.back} href={backHref}>
              ← {backLabel}
            </Link>
          </p>
        </footer>
      </div>
    </article>
  );
}
