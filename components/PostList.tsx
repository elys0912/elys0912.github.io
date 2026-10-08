import Link from "next/link";
import type { ReactNode } from "react";
import { formatDate } from "@/lib/format";
import type { PostListItem } from "@/lib/post-types";
import styles from "./PostList.module.css";

/**
 * カードの付け足し。渡した記事のカードは、右の日付の代わりに右肩へ badge を置き、
 * 要約の下に tags と公開日のチップを並べる。
 */
export type PostCardExtras = {
  /** 右肩に出すもの（バッジなど）。無ければ右肩は空ける */
  badge?: ReactNode;
  /** チップに出す語。公開日のチップは常にこの後ろに付く */
  tags?: readonly string[];
  /** チップの並びの aria-label */
  tagsLabel: string;
  /** 左の縦線を強調色（黄）にする */
  accent?: boolean;
};

/**
 * 一覧ページ。見出しと件数、1 行の説明、カードのリスト。
 * カードは左に縦線（緑。accent のものだけ黄）。既定は右に日付。cardExtras を渡すと、右肩にバッジ、下にチップ。
 */
export function PostList<T extends PostListItem>({
  title,
  lead,
  posts,
  emptyText,
  postHref,
  cardExtras,
}: {
  title: string;
  lead: string;
  posts: readonly T[];
  emptyText: string;
  /** 詳細ページへのリンク先 */
  postHref: (post: T) => string;
  cardExtras?: (post: T) => PostCardExtras;
}) {
  return (
    <>
      <div className={styles.heading}>
        <h1>{title}</h1>
        <p className={styles.count}>{posts.length} 件</p>
      </div>
      <p className={styles.lead}>{lead}</p>
      {posts.length === 0 ? (
        <p className={styles.empty}>{emptyText}</p>
      ) : (
        <ul className={styles.list}>
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} href={postHref(post)} extras={cardExtras?.(post)} />
          ))}
        </ul>
      )}
    </>
  );
}

function PostCard({ post, href, extras }: { post: PostListItem; href: string; extras?: PostCardExtras }) {
  return (
    <li
      className={[styles.card, extras ? "" : styles.post, extras?.accent ? styles.accent : ""].filter(Boolean).join(" ")}
    >
      <div className={styles.main}>
        <h2 className={styles.title}>
          {/* カード全体を押せるように、リンクの当たり判定をカードいっぱいに広げる（CSS） */}
          <Link href={href}>{post.title}</Link>
          {post.draft && <span className={styles.draft}>下書き</span>}
        </h2>
        <p className={styles.summary}>{post.summary}</p>
        {extras && (
          <ul className={styles.chips} aria-label={extras.tagsLabel}>
            {(extras.tags ?? []).map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
            <li>
              <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
            </li>
          </ul>
        )}
      </div>
      {extras ? (
        extras.badge
      ) : (
        <time dateTime={post.publishedAt} className={styles.date}>
          {formatDate(post.publishedAt)}
        </time>
      )}
    </li>
  );
}
