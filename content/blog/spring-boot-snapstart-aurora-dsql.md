---
title: "Spring Boot を Lambda の SnapStart で動かし、Aurora DSQL につなぐ"
summary: Spring Boot の API を AWS Lambda（Java 21、SnapStart）で動かし、Aurora DSQL に IAM 認証でつないだ。ハンドラと zip の作り方、SnapStart のフック、初回デプロイで踏んだ GRANT と tomcat-embed-el の失敗、DSQL の癖（CREATE INDEX ASYNC、DESC 不可、1 トランザクション 3,000 行）をまとめる。
publishedAt: 2026-09-24T09:00:00+09:00
---

# 構成

このサイトの API は、CloudFront → API Gateway HTTP API → Lambda（Java 21、arm64、SnapStart）→ Aurora DSQL という経路で動いている。常時課金されるものは作らない。作業は AI（Claude Code）と壁打ちしながら進めたが、方式の選択と失敗の原因の確認は自分でやった。

# ハンドラと zip

ハンドラは aws-serverless-java-container の HttpApiV2 用ハンドラで、API Gateway のイベントを Spring MVC に渡す。Spring の起動は static 初期化、つまり Lambda の INIT フェーズ。SnapStart ではこの状態がスナップショットになる。

zip は fat jar ではなく assembly 方式にした。クラスを zip の直下、依存を `lib/` に並べる。Lambda ではアダプタがリクエストを直接 DispatcherServlet に渡すので、組み込み Tomcat は不要。pom には残し、zip からだけ除外した。

## tomcat-embed-el を外して壊れた

この除外で 1 回壊した。パターンを `tomcat-embed-*` と書いたため、tomcat-embed-el まで消えた。Hibernate Validator は Jakarta EL の実装が要るので、Lambda の INIT で `ClassNotFoundException`。ローカルでは組み込み Tomcat が EL の実装を持っているから、発覚しないんだよな。除外を `tomcat-embed-core-*` と `tomcat-embed-websocket-*` に絞った。

# SnapStart のフック

SnapStart は INIT の後にスナップショットを取り、呼び出しのたびにそこから復元する。org.crac の `Resource` を 2 つ登録した。

- `beforeCheckpoint`：DB を使わない `/api/health` を内部で 1 回呼ぶ（priming）。リクエスト処理の経路の初期化をスナップショットに含める。失敗しても止めない
- `afterRestore`：DSQL の JDBC コネクタが static に持つ AWS の認証情報プロバイダを作り直す。INIT 時の認証情報をスナップショットに残さないため

登録の順番に意味がある。`afterRestore` は登録順、`beforeCheckpoint` は逆順に呼ばれる。認証情報のフックは Spring より先に登録し、Spring が接続プールを再開する前に作り直す。priming のフックは Spring より後に登録する。プールの停止と再開は Spring Boot に任せた。`allow-pool-suspension=true` を付けないと、警告が出るだけで停止しない。

# DSQL につなぐ

接続は aurora-dsql-jdbc-connector で、IAM 認証。API の Lambda は admin ではなく `app` という専用ロールで接続し、IAM の権限も `dsql:DbConnect` だけに限定した。DSQL の接続は最長 60 分なので、プールの `max-lifetime` は 50 分にした。

マイグレーションは API の Lambda ではやらない。SnapStart の INIT で admin 権限のない app ロールが DDL を試みてしまうから。同じ zip の別ハンドラをマイグレーション用の Lambda にして、`dsql:DbConnectAdmin` はこれだけに付けた。CDK の Trigger で、クラスタ → マイグレーション → API の Lambda の順に実行する。Flyway の後に、app ロールの作成と権限付与を冪等に行う。

## GRANT で失敗した

初回デプロイで、この Lambda が失敗した。原因は `GRANT USAGE ON SCHEMA public TO app`。DSQL では public スキーマがシステムのエンティティとして扱われ、SQLSTATE 0A000 で失敗する。PUBLIC には USAGE が最初から付いているので、この GRANT はそもそも要らなかったんだよな。`has_schema_privilege` で足りないときだけ付けるようにした。

原因にたどり着くまでがマジで長かった。Lambda の Java ランタイムはエラー応答に cause を載せないので、応答は "Migration failed" だけ。例外のメッセージに原因の連鎖と SQLSTATE を入れ、ロググループはロールバックしても残るようにした。

# DSQL の癖

PostgreSQL 互換とはいえ、DDL で引っかかる点がある。公式ドキュメントで確かめたうえで対処した。

- `CREATE INDEX` は `ASYNC` が必須。PostgreSQL は解釈できない。共通の DDL は `common/` に置き、食い違うものだけ `postgresql/` と `dsql/` に同じバージョンで置いて、プロパティで切り替える
- インデックスの `ASC` / `DESC` を受け付けない。昇順で張り、新着順は後方スキャンに任せる
- 主キーは UUID をアプリ側で生成する。1 ファイル 1 DDL
- `UNIQUE` は `CREATE TABLE` の制約として宣言する。空テーブルと同時に張られるので `ASYNC` が要らない
- 1 トランザクションで触れる行は 3,000 行まで。記事のいいねを記録するテーブルは、記事への外部キーを `ON DELETE CASCADE` にしなかった。記録が 3,000 行を超えると記事を削除できなくなる
- 楽観的同時実行制御の衝突（SQLSTATE 40001）は、トランザクションごとやり直す

ローカルとテストは Testcontainers の PostgreSQL で動かしている。

# AI との付き合い方

フックの登録順や DSQL の制約は、AI の説明だけじゃ信用せず、ドキュメントと実際のデプロイで確かめた。GRANT も tomcat-embed-el も、AI と一緒に書いたコードが本番の Lambda で初めて壊れた。ローカルで通ることと Lambda で動くことは別。失敗の原因を追えるログを先に用意しておくのが、やっぱいちばん効いた。

次回は、GitHub Actions から OIDC で AWS にデプロイする話を書く予定。
