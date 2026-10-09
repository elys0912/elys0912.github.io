# elys0912.github.io

elys0912 のブログ（サイト名は `src/site.ts` の `SITE_NAME` だけに書く）。https://elys0912.github.io/ で公開している。

- TypeScript のビルドスクリプト（`src/build.ts`）が `content/` の記事を読み、`out/` に静的な HTML を書き出す。GitHub Pages で配信する
- フレームワークは使わない。Node.js が `.ts` を直接実行する（型の除去）ので、バンドラーやトランスパイラーも無い
- ページは記事一覧（`/`）と記事（`/posts/<slug>/`）と 404。ほかに Atom フィード（`/feed.xml`）、`sitemap.xml`、`robots.txt` を出力する

## 記事を追加する

`content/blog/<slug>.md` を 1 記事 1 ファイルで置き、main に入れると公開される（`.github/workflows/pages.yml`）。

```markdown
---
title: 記事のタイトル
summary: 一覧と OGP に出す概要（1 行）
publishedAt: 2026-10-10T09:00:00+09:00
---

# 最初の節

本文。節は `#` で書く（表示では h2 になり、目次に出る）。下位の見出しは `##` から。
```

### frontmatter

| キー | 必須 | 内容 |
| --- | --- | --- |
| `title` | 必須 | タイトル |
| `summary` | 必須 | 概要。一覧、`<meta name="description">`、OGP、フィードに使う |
| `publishedAt` | 必須 | 公開日時。オフセット付きの ISO 8601（例: `2026-10-10T09:00:00+09:00`）。表示は日本時間の日付 |
| `marp` | 任意 | `true` で Marp のスライドの記事にする。`theme` などの Marp の指定も frontmatter に書け、本文の先頭に残してスライドに使う |

- 値は 1 行で書く。` #` の後ろはコメントとして読まないので、`#` を含むタイトルは `"…"` で囲む
- `draft` は使わない（下の「公開する記事だけを置く」）

### slug と本文

- slug はファイル名（`.md` を除いたもの）で、URL（`/posts/<slug>/`）になる。英小文字・数字と `-` だけ（`^[a-z0-9]+(-[a-z0-9]+)*$`）
- 一度公開した slug は変えない（URL が変わり、前の URL へのリンクが切れる）
- `content/blog/` の直下には `.md` だけを置く（`.gitkeep` は可）
- 本文は UTF-8 で 128KB（131,072 バイト）まで。超えたら記事を分ける
- Markdown 中の生の HTML は表示しない（通常の記事では取り除き、Marp の記事では文字としてそのまま表示する）

### 公開する記事だけを置く

このリポジトリは公開されているので、置いた Markdown はサイトに出なくても誰でも読める。下書きはこのリポジトリの外で書き、公開できる状態になってから置く。次のどれかがあると `npm run build` が失敗する（CI もデプロイも止まる）。

- `draft: true` の記事
- `publishedAt` が未来の記事（予約公開はしない）
- 読めない記事（frontmatter の誤り、`draft:true` や `Draft: true` のような読めない書き方、`.` で始まる `.md`、`.md` でないファイル、slug の形）
- 本文が 128KB を超える記事

## 画像

```
content/images/<slug>/<ファイル名>.webp   （.png、.jpg、.jpeg も可）
本文: ![説明](/images/<slug>/<ファイル名>.webp)
```

- `<slug>` は、その画像を使う記事の slug。本文では `/images/<slug>/<ファイル名>` の形で参照する（Marp のスライドの `url(…)` も同じ）
- ビルドのとき、公開した記事から参照されている画像だけが `out/images/` にコピーされる。参照先が無ければ警告を出す
- 画像の形式・サイズ・メタデータは検査しない。EXIF の位置情報などは消してから置き、スクリーンショットに個人名、メールアドレス、通知などが写っていないか確かめる。`![説明]` の説明は、画像が見えない人にも内容が伝わるように書く

## ビルドと確認

Node.js 24 以上を使う（`.ts` のファイルを Node.js が直接実行するため）。

```sh
npm ci
npm run typecheck    # tsc --noEmit
npm run build        # out/ に書き出す（node src/build.ts）
npm run preview      # out/ を静的サーバーで開く（npx serve out。serve は依存に入れていない）
```

記事を直したら `npm run build` をやり直す（開発サーバーは無い）。

## 構成

- `content/`：記事（`blog/*.md`）と画像（`images/<slug>/`）
- `public/`：そのまま `out/` にコピーするファイル（`favicon.ico`、`icon.svg`、`apple-icon.png`、`opengraph-image.png`）
- `src/build.ts`：入口。記事を読み、ページ、フィード、CSS、画像を `out/` に書く
- `src/posts.ts`：記事の読み込みと検査、画像の参照の拾い方
- `src/html.ts`：ページの HTML（トップ、記事、404、`<head>`）
- `src/css.ts`：CSS を 1 本（`out/assets/site.css`）にまとめる。CSS Modules の class を「ファイル名_class」（例 `.PostList_title`）に書き換えて結合する
- `src/feed.ts`：`feed.xml`（Atom 1.0）、`sitemap.xml`、`robots.txt`
- `src/site.ts`：サイトの URL、サイト名、説明、ナビ、フッターの設定（変えるときはここだけを直す）
- `src/client.js`：ブラウザで動く小さなスクリプト（目次の現在地、フッターの「前のページへ戻る」）
- `src/FooterBackButton.module.css`：このブログだけの CSS

### portfolio との共有（`shared/`）

見た目を portfolio（別のリポジトリ）と揃えるため、CSS と Markdown・Marp の変換処理を portfolio から受け取っている。

- `shared/` の下に、portfolio の `frontend/` と同じ相対パスで置く（例 `shared/lib/markdown.ts`、`shared/components/PostList.module.css`）
- 並んでいるファイルは `shared-with-blog.txt`（portfolio の `frontend/` からの相対パス）。同期で上書きされるので、このリポジトリでは直さない。直すときは portfolio 側で直して同期する
- HTML の構造と class 名は、portfolio の React コンポーネントが出すものに合わせて `src/html.ts` に書いている。portfolio のコンポーネントの構造を変えたら、`src/html.ts` も合わせる

## デプロイ

main への push（と手動の実行）で `.github/workflows/pages.yml` がビルドし、GitHub Pages に配信する。リポジトリの Settings → Pages の Source を「GitHub Actions」にしておく。PR と main への push では `.github/workflows/ci.yml` が `typecheck` と `build` を行う。

## ライセンス

- コード：[MIT License](LICENSE)
- 記事の文章・図・画像：著作権は作者。無断での転載・複製・改変・再配布は不可、引用のみ可（[content/LICENSE.md](content/LICENSE.md)）。記事の中のコード片は MIT
