---
title: "backend を Java 25 に上げて、テストを Spock に替える"
summary: Java を 21 から 25 に上げたら 8 ファイル 12 行で済んだ。テストは JUnit から Spock に替え、3 本を観点ごとの 5 つの Spec に分けた。Spock の版の選び方、surefire の includes の落とし穴、Stub と Mock の使い分けをまとめる。
publishedAt: 2026-10-09T21:00:00+09:00
tags: [spring-boot, testing, portfolio]
---

# はじめに

このサイトの backend は Spring Boot 4.1.1 を AWS Lambda（SnapStart）で動かし、Aurora DSQL につないでいる。2026-10-08 に PR を 2 本入れた。Java 21 → 25 と、テストを JUnit から Spock に替える話。前者は短く、後者は長い。

# Java 25 は 12 行

変えたのは pom の `java.version`、CI と Deploy の setup-java の `java-version`、CDK の Lambda の runtime（API と migration の 2 つ）、infra のテスト、README と /about/site/ の記載。合計 8 ファイル 12 行。

SnapStart は java25 のランタイムにも対応していたので、構成は変えていない。詰まる所を探したが、無かった。上げるだけなら 12 行。記事にするほどでもない（？）。

# テストを Spock に

## 読めば何を保証しているか分かるように

動機はこれだけ。1 つの Spec で 1 つの対象の 1 つの観点だけ。given/when/then のラベルと where: の表があると、テストが文章として読めるんだよな。

## 版は Groovy に合わせる

依存は spock-core と spock-spring の 2.4-groovy-5.0。Spock は Groovy のメジャー版ごとに成果物が分かれるので、Spring Boot 4.1 が管理する Groovy 5.0 に合わせた。Groovy 本体の版は Boot の groovy-bom に任せ、上書きしない。Spring Boot 4.0 で Boot 側の Spock 連携がなくなったので、@SpringBean などの橋渡しは spock-spring を直接入れる。

## ビルドと surefire の落とし穴

gmavenplus-plugin 5.1.0 で `src/test/groovy` をコンパイルする（addTestSources、compileTests）。Java のテストの後に走るので、Spec から Java の TestcontainersConfiguration をそのまま使える。

落とし穴は surefire。includes を書くと既定（Test*／*Test／*Tests／*TestCase）が丸ごと置き換わる。既存は全部 *Tests なので、`*Tests.java` と `*Spec.java` を並べて書いた。Groovy の Spec も surefire には `*Spec.java` で引っかかる。追加のつもりが置き換えになるので、普通は気づかないだろう。

## 3 本を 5 つの Spec に

書き換えたのは post パッケージの 3 本（PostService／PostController／PostRepository、235 行）。観点ごとに割って 5 つの Spec（TESTING.md 含め 526 行の追加）。

- PostServiceSpec：API に出す種類の投稿だけ返す。ブログは別サイトへ移したので、DB に残る blog の行は出さない
- PostControllerSpec：クエリの kind の変換とレスポンスの形
- PostControllerKindRejectionSpec：受け付けない kind を 400 で断り、サービスに届けない
- PostRepositorySpec：公開済みの行だけを公開日時の新しい順に（Testcontainers の PostgreSQL 16、Flyway のスキーマ）
- PostRepositoryConstraintSpec：同じ slug を 2 行保存させない

書き方の決まりは TESTING.md に。@Title で保証することを 1 文、@Narrative で背景と観点の範囲、@Subject で対象。メソッド名は日本語で「条件 → 結果」。ラベルにも何をするかを書く。入力だけ違うケースは where: の表。

```groovy
@SpringBean
PostService postService = Mock()

def "kind=#kind（#reason）を指定すると、400 を返し、サービスを呼ばない"() {
    when: "API が受け付けない kind を付けて一覧を取る"
    def response = mockMvc.perform(get("/api/posts").param("kind", kind)).andReturn().response

    then: "クエリの変換で断るので、サービスには届かない"
    0 * postService._

    and: "400 を返す"
    response.status == 400

    where:
    kind   | reason
    "news" | "未知の種類"
    "blog" | "別のサイトに移したブログ。DB に行は残るが、API では未知の値と同じ扱い"
}
```

## Stub と Mock、条件式

結果だけ使う問い合わせの相手は Stub()。引数が合わない呼び出しには空の値が返るので、結果の検証で落ちる。「呼ばない」「1 回だけ」を確かめたいときだけ Mock() にして `0 * postService._`。上の Spec がそれ。

AssertJ は使わない。Spock の条件式は失敗時に式の各部分の値が出る。複数項目は `with(x) { }`、まとめて見るなら `verifyAll`、例外は `thrown(型)`。これで足りる。

DB の層の Spec は `@Requires({ DockerClientFactory.instance().isDockerAvailable() })` で、Docker が無い環境ではスキップ。JUnit 側の `@Testcontainers(disabledWithoutDocker = true)` と同じ扱い。

なお、JUnit のテストは残りのパッケージにまだある。パッケージごとに移している途中。

# AI との壁打ち

2 本とも作業は AI（Claude Code）にやらせた。決めたのはこっち。Spock の版の選び方と surefire の includes の置き換わりは、AI の説明を pom とビルド結果で確かめた。説明だけで信じるのは流石に無理。ビルドが通って初めて信じる。やはり AI には決めさせない。
