---
title: "OpenAPI で backend と frontend の型をそろえる"
summary: Spring Boot の API と Next.js の静的サイトで、手書きの型が API とずれてビルドが止まった。仕様を openapi.json に書き出してコードとのずれをテストで検出し、frontend の型はそこから生成するようにした話。記事が 0 件でも静的 export を通す小技も。
publishedAt: 2026-09-23T21:00:00+09:00
---

# はじめに

このサイトの backend は Spring Boot、frontend は Next.js の静的 export。frontend はビルド時に API から記事を取り、静的なページにする。

最初、frontend の型は手書きだった。AI（Claude Code）と壁打ちしながら骨組みを作った段階では、backend の API がまだなかったので、こうなるだろうという形で書いていた。実際の API につないだら、ビルドが型ガードで止まった。

ずれていたのは 2 点。手書きの型は記事に `id` があると思っていたが、backend は slug しか返さない。一覧の要素に本文（`bodyMarkdown`）があると思っていたが、backend の一覧は本文を含まない。

# まず手で合わせる

1 回目の修正は、backend に合わせて手で直した。

- `Post` 型をやめ、backend の `PostSummary`（一覧）と `PostDetail`（詳細）に合わせて 2 つに分ける
- 型ガードも一覧用と詳細用に分け、一覧に本文を要求しない
- 一覧の React の `key` を `id` から `slug` に変える
- モックは詳細 API の形で持ち、一覧では `PostSummary` の形に絞る。日時は API と同じ UTC で書く

これで動くようにはなった。ただ、手で合わせただけだと、次に backend が変わったときにまた気づけないんだよな。

## 記事が 0 件でもビルドを通す

同じ PR で、もう 1 つ直したことがある。`output: "export"` では、動的ルートの `generateStaticParams` が 1 件以上返さないとビルドが失敗する。記事が 0 件の種別があると、それだけでビルドが落ちる。

対処は、0 件のときだけ `__placeholder__` という slug を 1 件返し、そのページは `notFound()` で 404 にすること。一覧には出さない。0 件のときにしか使わないので、実在する記事との衝突もない。公開前のサイトは記事 0 本。この小技がないと、デプロイの練習すらできなかった。

# 仕様をファイルに書き出す

2 回目の修正は backend 側。springdoc-openapi を入れて、OpenAPI の仕様を `backend/openapi/openapi.json` としてリポジトリに置いた。

要点は、仕様を手で書かないこと。コードから生成し、生成結果とコミット済みのファイルを比較するテストを置いた。`OpenApiSpecTests` が MockMvc で `/v3/api-docs` を取り、ファイルと比べる。ずれていればテストが失敗するので、CI の `./mvnw verify` で検出できる。API を変えたときは `-Dopenapi.update=true` を付けて同じテストを走らせると、ファイルが書き換わる。

生成する仕様の中身も少し調整した。

- DTO のプロパティは既定で required にする。null を型に含めたものだけ任意
- `PostKind` は小文字の名前付き enum、日時は `date-time`
- 400 と 404 も記載する

`/v3/api-docs` と Swagger UI は既定で無効にし、dev プロファイルだけ有効にした。本番で仕様を公開するつもりはない。無効になっていることもちゃんとテストで確認している。

# 型を生成する

frontend は openapi-typescript で `openapi.json` から `lib/api-schema.d.ts` を生成する。コマンドは `npm run gen:api`。`lib/types.ts` は生成した型の別名だけになった。

```ts
import type { components } from "./api-schema";
type Schemas = components["schemas"];
export type PostKind = Schemas["PostKind"];
export type PostSummary = Schemas["PostSummary"];
export type PostDetail = Schemas["PostDetail"];
```

CI では生成し直して `git diff --exit-code` で比べる。コミット済みの型が古ければ失敗する。`openapi.json` が変わったときも frontend の CI が走るよう、paths フィルタにこのファイルを足した。

これで、backend の変更 → テストが `openapi.json` の更新を要求 → frontend の CI が型の再生成を要求、と連鎖する。どこかでずれが放置されることは、もうない。

# AI との付き合い方

最初の手書きの型は、backend がない段階で AI と一緒に書いたもの。ありそうな形ではあるが、根拠がない。根拠のない型をそのまま使い続けていたのが、やっぱ問題だった。

手で合わせて終わりにするか、仕様をファイルに書き出してテストで比べる形にするかは、自分で決めた。後から変えにくいことではないので、まず手で直して動かし、次の PR で仕組みにした。2 つのコードベースの間の契約は、人じゃなくてテストが覚えておくものなんだよな。

次回は、Spring Boot を Lambda の SnapStart で動かし、Aurora DSQL につないだ話を書く予定。
