// 記事の表示に要る最小の形。データの出どころ（API、Markdown のファイル）には依らない。
// 一覧（PostList）と詳細（PostDetail）は、これを満たす値なら何でも受け取る。

/** 一覧に出す 1 件。本文は含まない */
export type PostListItem = {
  slug: string;
  title: string;
  summary: string;
  /** ISO 8601 の日時 */
  publishedAt: string;
  /** 下書きなら true。公開済みなら付けないか false */
  draft?: boolean;
  /** 記事のタグ（書いた順）。書いていなければ付けない（API の記事と作品にも無い） */
  tags?: string[];
};

/** 詳細に出す 1 件。本文の Markdown を含む */
export type PostContent = PostListItem & {
  bodyMarkdown: string;
  /** ISO 8601 の日時 */
  updatedAt: string;
};
