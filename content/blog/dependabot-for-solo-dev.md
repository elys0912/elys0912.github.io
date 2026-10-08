---
title: "個人開発での Dependabot の運用"
summary: 個人のリポジトリで Dependabot の PR をどう捌いているか。グループ化と major の除外、週末にまとめて処理する流れ、lockfile の競合の直し方、まとめてマージすると Deploy が取り消される話、Maven wrapper の更新で mvnw.cmd が CRLF で入った話。
publishedAt: 2026-10-06T21:00:00+09:00
---

# はじめに

このサイトのリポジトリは backend（Maven）、frontend（npm）、infra（npm）、GitHub Actions の 4 つの依存関係を持つ。Dependabot を全部に入れている。個人開発なので、PR を見るのは自分 1 人。放っておくと PR が溜まるので、運用を決めた。

作業は AI（Claude Code）と壁打ちしながら進めている。どの PR を先に入れるかは自分で決める。

# 設定

4 つのエコシステムとも weekly にした。毎日来ても流石に見ない。

PR の本数を減らすため、グループを 2 つ作った。frontend では next、eslint-config-next、react、react-dom、@types/react を 1 つの PR にまとめる。infra では aws-cdk、aws-cdk-lib、constructs をまとめる。別々に上げても、どうせ一緒に動かさないと意味がない。

major の更新はいくつか止めている。理由はコメントに書いてある。

- @types/node：実行環境の Node 24 に型定義をそろえる
- typescript：typescript-eslint が TS 7 に未対応
- eslint：eslint-config-next が ESLint 10 に未対応

止める理由を書いておかないと、後で「なぜ止めたか」を忘れて、ずっと止めたままになるんだよな。

# まとめて処理する

10 月の最初の週末、2 日に分けて 10 本を処理した。

1 日目は 3 本。aws-cdk、AWS SDK の BOM、next のグループ。2 日目は 7 本。AWS SDK の BOM がもう 1 回、Maven wrapper（apache-maven）、cdk のグループ、@swc/core、@types/node が frontend と infra で 1 本ずつ、next のグループがもう 1 回。

順番は決めている。next のような、セキュリティの修正が含まれうるものを先に入れる。次に backend と infra。開発用の依存は最後。

## lockfile の競合

同じ package-lock.json を触る PR が複数あると、1 本をマージした時点でほかの PR が競合する。Dependabot の PR に `@dependabot rebase` とコメントすると、main に合わせて作り直してくれる。手で lockfile を直すより確実。rebase の後は CI が走り直すので、通るのを待ってからマージする。

# まとめてマージすると Deploy が取り消される

2 日目は 4 本の PR を 16 秒のうちに続けてマージした。main への push のたびに Deploy ワークフローが走る。Deploy は `concurrency` で同時実行を 1 つに絞り、`cancel-in-progress: false` にしている。

ここで、deploy.yml に AI が書いた「後から来たものは待たせる」というコメントがあった。後続の実行が全部順番待ちになるように読める。実際には、待てるのは 1 つだけ。GitHub のドキュメントにも、同じグループに待機中の実行があれば、それは取り消されて新しい実行に置き換わると書いてある。残るのは、実行中の 1 つと最後に来た 1 つ。

各 Deploy はその時点の main を使うので、最後の 1 回で全部反映される。壊れはしない。ただ、どの PR のデプロイが成功したかは 1 本ずつ追えない。追いたければ、マージの間隔を空けるしかない。今は、まとめて入れる日はまとめて 1 回のデプロイでいいと割り切っている。

この件は devlog #1 にも書いた。AI の説明をそのまま設計の根拠にしないと決めたきっかけ。

# mvnw.cmd が CRLF で入った

Maven wrapper の更新（apache-maven 3.9.16 → 3.10.0）の PR は、`mvnw.cmd` を 378 行まるごと置き換えていた。マージした後、手元で checkout すると `mvnw.cmd` に差分が出続けるようになった。何も触ってないのに。

原因は改行コード。`.gitattributes` で `*.cmd` は `text eol=crlf` と定めている。これは「リポジトリの中（blob）は LF で持ち、作業ツリーでは CRLF にする」という意味。ところが Dependabot が入れた blob は CRLF のままだった。Git は checkout のたびに正規化しようとして、差分が出る。

直し方は、blob を LF に正規化してコミットし直すこと。作業ツリーでは属性により CRLF になる。ほかのファイルには触らない。Dependabot の PR は中身を読まずにマージしがちだけど、Windows 用のスクリプトみたいに改行が意味を持つファイルは、diff の行数が多いときに一度はちゃんと確かめた方がいい。

# 今のところの運用

- weekly。グループで本数を減らし、major は理由を書いて止める
- 週末にまとめて処理する。セキュリティの修正を含みうるものから先に
- lockfile の競合は `@dependabot rebase`
- まとめてマージした日は、Deploy は最後の 1 回で全部反映されると割り切る
- diff が大きい PR は、改行コードを含めて中身を見る

次回は、記事を Git で管理して、デプロイのたびに DB に upsert する仕組みを書く予定。
