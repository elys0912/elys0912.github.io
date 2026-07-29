# elys0912.github.io

elys0912 の技術ブログ。https://elys0912.github.io/ で公開している。

- Next.js の静的出力（`output: "export"`）で `out/` に HTML を書き出し、GitHub Pages で配信する
- 記事は `content/blog/*.md`。ビルドのときに直接読む（データベースや API は使わない）
- ページは記事一覧（`/`）と記事（`/posts/<slug>/`）。ほかに Atom フィード（`/feed.xml`）と `sitemap.xml` を出力する

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
- `content/blog/` の直下には `.md` だけを置く。`.` で始まる名前のファイル（`.gitkeep` を除く）は読み込まれないので、置くと CI もビルドも失敗する
- 本文は UTF-8 で 128KB（131,072 バイト）まで。超えたら記事を分ける
- Markdown 中の生の HTML は表示しない（通常の記事では取り除き、Marp の記事では文字としてそのまま表示する）

### 公開する記事だけを置く

このリポジトリは公開されているので、置いた Markdown はサイトに出なくても誰でも読める。下書きはこのリポジトリの外で書き、公開できる状態になってから置く。

- `draft: true` の記事を置くと CI（`npm run check:drafts`）が失敗する。ビルドも下書きをサイトに出さない
- `draft` の行が `draft: true` / `draft: false` の形で読めない書き方（`draft:true`、`Draft: true`、インデントした行、値が空や `yes` など）だと、CI もビルドも失敗する
- `publishedAt` が未来の記事も CI が失敗する（予約公開はしない）。ビルドもその時点で未来の記事はサイトに出さない
- 読めない記事（frontmatter の誤り、slug の形、本文の上限、外部の URL の画像）があると、CI もビルドも失敗する

## 画像

```
content/images/<slug>/<ファイル名>.webp   （.png、.jpg、.jpeg も可）
本文: ![説明](/images/<slug>/<ファイル名>.webp)
```

- `<slug>` は、その画像を使う記事の slug（`content/blog/<slug>.md` があること）。`images/` の直下には `<slug>/` のディレクトリだけ、`<slug>/` の中には画像のファイルだけを置く
- ファイル名は英数字と `.`、`_`、`-` だけ（先頭は英数字）
- 形式は WebP、PNG、JPEG。1 枚 500KB まで、1 記事 40 枚・合計 5MB まで。`content/images/` 全体が 300MB を超えたら警告する
- 本文では `/images/<slug>/<ファイル名>` の形で参照する（Marp のスライドでも同じ）。外部の URL、`data:`、相対パスは使えない（CI もビルドも失敗する）。Marp の記事では、frontmatter（`style`、`backgroundImage` など）と HTML のコメントの指定（`<!-- _backgroundImage: url(…) -->`）の `url(…)` と `@import "…"` も同じ規則で検査する。`![説明]` の説明は、画像が見えない人にも内容が伝わるように書く
- EXIF や XMP などのメタデータ（撮影日時や位置情報が入りうる）は消してから置く。残っていると CI が失敗する
- スクリーンショットに個人名、メールアドレス、通知などが写っていないか確かめる
- ビルドのとき、公開した記事から参照されている画像だけが `out/images/` にコピーされる

検査は `npm run check:images`（CI でも動く）。

## ローカルで確認する

Node.js 24 以上を使う（`.ts` のファイルを Node.js が直接読むため）。

```sh
npm ci
npm run dev          # http://localhost:3000/ で確認する
```

CI と同じ検査:

```sh
npm run lint
npm run typecheck
npm test
npm run check:drafts
npm run check:images
npm run build        # out/ に出力する（next build と後処理の scripts/postbuild.mjs）
```

`out/` は任意の静的サーバーで確認できる（例: `npx serve out`）。

## 構成

- `app/`：ページ、フィード、sitemap、アイコン
- `components/`、`lib/`：表示の部品と記事の読み込み
- `lib/site.ts`：サイトの URL、サイト名、説明、ナビ、フッターの設定（変えるときはここだけを直す）
- `scripts/`：検査（`check-drafts.mjs`、`check-images.mjs`）、ビルドの後処理（`postbuild.mjs`）、ビルドと検査が共通で使う規則（`content-rules.mjs`、`content-images.mjs`、`content-limits.mjs`）
- `shared-with-blog.txt`：別のリポジトリと共有している部品の一覧。並んでいるファイル（と一覧自身）は共有元と 1 バイトも違わない状態に保つので、このリポジトリでは直さない。`scripts/shared-with-blog.test.mjs` が、共有部品が一覧の外のファイルと `package.json` に無いパッケージに依存していないことを確かめる

## デプロイ

main への push（と手動の実行）で `.github/workflows/pages.yml` が `check:drafts`、`check:images`、ビルドを行い、GitHub Pages に配信する。リポジトリの Settings → Pages の Source を「GitHub Actions」にしておく。

## ライセンス

- コード：[MIT License](LICENSE)
- 記事の文章・図・画像：著作権は作者。無断での転載・複製・改変・再配布は不可、引用のみ可（[content/LICENSE.md](content/LICENSE.md)）。記事の中のコード片は MIT
