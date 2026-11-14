---
title: "デプロイのたびに Lambda が更新されていた：zip の日時を固定する"
summary: backend を触っていない Deploy でも、毎回 Lambda のコードが更新され、SnapStart のスナップショットとマイグレーションが走り直していた。原因は zip の中のファイルの日時。pom に project.build.outputTimestamp を 1 行足して直した話と、-DskipTests でも動いていたテストのコンパイルと fat jar の話。
publishedAt: 2026-10-16T09:00:00+09:00
tags: [aws, ci-cd, portfolio]
---

# はじめに

このサイトの API は Spring Boot を Lambda の SnapStart で動かしている（構成は[別の記事](/posts/spring-boot-snapstart-aurora-dsql/)に書いた）。2026-10-14 のレビューで、backend を触っていない Deploy でも、毎回 Lambda のコードが更新されていることが分かった。

直したのは pom の 1 行と、Deploy のワークフローの 1 行。原因が分かってしまえば小さい話だが、ずっと「変わっていないはず」と思い込んでいたところなので書いておく。レビューは AI（Claude）の 2 つのモデルに別々にやらせ、直すかどうかと直し方はこっちで決めた。

# 何が起きていたか

Deploy の流れはこうなっている。

1. main に push すると Deploy のワークフローが動く
2. スタックに関係するファイル（記事、infra、backend など）が変わっていれば、backend を `./mvnw package` で zip にする
3. `cdk deploy` で、その zip を Lambda のコードとして上げる

CDK は zip を `Code.fromAsset()` で受け取り、ファイルの中身からハッシュを計算する。このハッシュが前回と違うと、CDK は「コードが変わった」とみなす。そうなると次のことが全部起きる。

- zip（約 60MB）をアセット用のバケットに上げ直す
- API の Lambda のコードを更新し、新しいバージョンを公開する
- SnapStart のスナップショットを作り直す。SnapStart は公開したバージョンごとにスナップショットを持つ
- マイグレーション用の Lambda も同じ zip を使っているので、こちらも新しいバージョンになり、マイグレーションの Trigger が走り直す

記事を 1 本足しただけの Deploy でも、これが毎回起きていた。2026-10-08〜2026-10-14 の 7 日で数えると、スタックをデプロイした Deploy のうち backend を含まないものが 13 回ある。バージョンの公開とスナップショットに 1 回 2〜3 分かかるとすると（推定）、公開直後のペースで月 110〜170 分になる。GitHub Actions の無料枠を[使い切ったばかり](/posts/github-actions-free-quota/)なので、地味に効く数字だった。

# なぜ zip が毎回変わるのか

zip の中の各ファイルには、中身と一緒に更新日時が記録されている。

Deploy は毎回まっさらな runner で動き、ソースからコンパイルし直す。`target/classes` のクラスファイルの日時はビルドした時刻になり、毎回違う。ソースが同じで、できたクラスファイルの中身も同じでも、zip に入る日時が違えば zip のバイト列は変わる。バイト列が変われば、ハッシュも変わる。

つまり、CDK から見ると「毎回違う zip」が届いていた。

実は前のレビューで、画像だけの変更でも `cdk deploy` が走る件を拾ったとき、記録に「スタックは変わらない」と括弧書きしていた。その前提が成り立っていなかったことになる。レビューでは、2 つのモデルのうち片方だけがこれを指摘している。CDK のコード（`Code.fromAsset()`）、pom（zip の組み立て）、Deploy のワークフロー（毎回ビルド）をつないで読み、「スタックは変わらない」を疑ったのが効いた。もう片方は、Deploy を起動する条件の確認までで止まっていた。

# 直し方：project.build.outputTimestamp

Maven には、再現可能なビルド（同じ入力から同じバイト列を作る）のためのプロパティがある。`project.build.outputTimestamp` に日時を書いておくと、jar や zip を作るプラグイン（maven-jar-plugin、maven-assembly-plugin など）が、中のファイルの日時をこの値にそろえる。

pom の `properties` に 1 行足した。

```xml
<project.build.outputTimestamp>2026-01-01T00:00:00Z</project.build.outputTimestamp>
```

値に意味は無い。毎回同じであればいいので、変えなくてよい。Spring Boot の親 pom（spring-boot-starter-parent 4.1.1）がこのプロパティを設定していないことは、レビューの時点で確かめてある。

案はもう 1 つあった。CDK の側で、アセットのハッシュを zip の中身ではなく、backend のディレクトリの git の tree のハッシュにする方法。レビューの推奨は pom のほうで、それに従った。

確かめたのは 3 つ。

- 手元で JDK 25 を使って 2 回ビルドし、zip の SHA-256 が一致した
- マージ後の最初の Deploy では、日時が変わった分、Lambda の更新が 1 回走る。これは想定どおり
- マージ後 2 回目の、backend を触らない Deploy で、API のスタックが `no changes` になった。Deploy をまたいでも zip が同じということ

# ついでに：-DskipTests でも動いていたもの

同じ行で、もう 1 つ直している。

Deploy は、マージした PR の CI がすべて通っていれば、テストを省いて zip だけを作る。そのときのコマンドが `./mvnw -B package -DskipTests` だった。`-DskipTests` はテストの実行を飛ばすだけで、テストのコンパイルは飛ばさない。

このリポジトリのテストは Spock（Groovy）で書いてあり、GMavenPlus というプラグインがコンパイルしている。プラグインの定義を見ると、このコンパイルが見ているのは `maven.test.skip` で、`-DskipTests` では止まらない。使わないテストを、Deploy のたびにコンパイルしていた。

もう 1 つ、Spring Boot の親 pom は `package` のたびに fat jar（依存を全部入れた実行用の jar）を作る設定になっている。Lambda が使うのは assembly で作った zip だけで、fat jar はどこからも使っていない。

というわけで、テストを省く Deploy のコマンドはこうなった。

```sh
./mvnw -B package -Dmaven.test.skip=true -Dspring-boot.repackage.skip=true
```

zip の中身だけでハンドラを起動するスモークテストは、もともと `-DskipTests` で飛んでいたので、検査の範囲は変わらない。テストを省かない Deploy と PR の CI は `./mvnw verify` のままで、スモークテストもそちらで動く。Deploy のコマンドの行は、infra のテストで文字列として検査しているので、その期待値も合わせて直した。

省けた時間は Deploy 1 回あたり 20〜40 秒と見積もっている（推定）。

# 残ること

- `outputTimestamp` がそろえるのは日時だけ。依存のバージョンや JDK が変われば、中身が変わって zip も変わる。依存はそれで正しいし、JDK もバージョンを上げれば変わってよい
- Lambda のバージョンは、コードが変わるたびに増える。CDK の既定では古いバージョンを残すようで、溜まるとリージョンのコードの保存容量の上限に近づいていく。こちらは別の PR で、置き換わった古いバージョンを消す設定にした

zip の日時は、普段は気にもしないところ。とはいえ、中身のハッシュで差分を見る仕組みの前では、日時も中身のうちなんだよな。CDK に限らず、ハッシュで「変わったか」を決める道具に渡すものは、同じ入力なら同じバイト列になっているかを一度疑っておくとよさそう。
