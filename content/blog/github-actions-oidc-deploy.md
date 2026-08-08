---
title: "GitHub Actions から OIDC で AWS にデプロイする"
summary: "長期のアクセスキーを置かずに、GitHub Actions から OIDC で AWS のロールを引き受けてデプロイする。信頼ポリシーの sub を不変の形式に合わせた話、id-token: write をデプロイのジョブだけに絞ってテストで検査する話、GitHub Free の private リポジトリでは Environments が使えない話。"
publishedAt: 2026-09-24T21:00:00+09:00
---

# はじめに

デプロイは GitHub Actions で、main に push するたびに Deploy ワークフローが走る。AWS への認証は OIDC。長期のアクセスキーをリポジトリの Secrets に置かず、GitHub が発行する短命のトークンでロールを引き受ける。

CDK のスタックとワークフローは AI（Claude Code）と壁打ちしながら書いた。

# OIDC のスタック

OIDC プロバイダとロールを 2 つ、1 つのスタックに置いた。

デプロイ用のロールは、`sub` がリポジトリの main ブランチのときだけ引き受けられる。権限は、`cdk bootstrap` が作ったロール（deploy、file-publishing、lookup）の AssumeRole だけ。S3 への sync と CloudFront の invalidation は、対象のリソースを持つ側のスタックが、そのバケットとディストリビューションに限定して付ける。

PR 用のロールは `sub` が `pull_request` で、`cdk diff` に要る読み取りだけ。

デプロイ用のロール自身は、このスタックを更新できない。自分の信頼ポリシーを自分で書き換えられる形は、流石にまずいだろ。このスタックの変更は手元から `cdk deploy` する。

# Free の private では Environments が使えない

OIDC の `sub` には 2 つの形がある。ブランチで絞る `repo:<repo>:ref:refs/heads/main` と、Environment で絞る `repo:<repo>:environment:production`。

GitHub Free の private リポジトリでは Environments が使えない。なのでブランチの形にした。public にしたら Environment に切り替えたいので、CDK の props で両方を選べるようにしてある。Environment を使うときは、デプロイできるブランチを main に限定する保護ルールが必須。ルールがないと、どのブランチの実行でも environment を名乗れて、ブランチの形より弱くなる。

同じ理由で、main のブランチ保護で CI を必須にもできない。そこで Deploy ワークフローでは、`cdk deploy` の前に backend のテストをもう 1 度ちゃんと通している。

# id-token: write をデプロイのジョブだけに

OIDC のトークンを取るには `id-token: write` が要る。ここが落とし穴で、信頼ポリシーの `sub` は「main ブランチの実行」としか言っていない。main で `id-token: write` を持つワークフローは、どれでもデプロイ用のロールを引き受けられる。

だから `id-token: write` は Deploy ワークフローの deploy ジョブだけに付け、ワークフロー全体の `permissions` は `contents: read` にした。ほかのワークフロー（CI、セキュリティ検査）には付けない。

これは約束じゃなくて、テストにした。infra のテストが `.github/workflows/` の全ファイルを読み、次を検査する。

- `id-token: write` を含むファイルが `deploy.yml` だけであること
- `deploy.yml` の中でも、`jobs:` より前（ワークフロー全体の permissions）に書かれていないこと
- コメント行は除いて読む。説明文に書いても権限にはならないので

将来、別のワークフローに `id-token: write` が付いても、CI で止まる。

# 初回デプロイで拒否された

最初のデプロイで、`AssumeRoleWithWebIdentity` が拒否された。信頼ポリシーの `sub` は `repo:<owner>/<repo>:ref:refs/heads/main` と書いていた。

CloudTrail の拒否イベントを見ると、届いた `sub` の形が違った。`repo:<owner>@<所有者の数値 ID>/<repo>@<リポジトリの数値 ID>:ref:refs/heads/main` という形。GitHub の「不変の sub（immutable subject）」がこのリポジトリで有効になっていた。`gh api repos/<owner>/<repo>/actions/oidc/customization/sub` で設定を確認できる。

不変の sub を無効にして戻すのではなく、信頼ポリシーをこの形式に合わせた。不変の sub では、リポジトリが消されて同じ名前で作り直されても別物として扱われる。名前だけの形式より安全。名前だけの形式に戻ったら検出するテストも足した。

# デプロイの流れ

1. backend を `./mvnw verify`
2. `cdk deploy` で API と静的サイトのスタックを更新し、出力をファイルに書く
3. 出力からバケット名、ディストリビューション ID、サイトの URL を読む
4. frontend を `npm run build`
5. `aws s3 sync --delete` で静的サイトを上げ、CloudFront の invalidation を出す

ロールの ARN はリポジトリの Variables から読む。空ならジョブをスキップして成功で終える。AWS の準備ができる前からワークフローを置いておけるようにするため。

# AI との付き合い方

OIDC の設定は、AI が書いた形がそのまま動くことが多い。動くからこそ、権限の範囲が広すぎても気づきにくいんだよな。ロールの権限を bootstrap のロールの AssumeRole に絞る、`id-token: write` をジョブに絞る、ロール自身にスタックの更新をさせない、の 3 つは AI に任せず自分で範囲を決めた。拒否の原因も、AI の推測じゃなく CloudTrail の拒否イベントと GitHub の設定で確かめた。

次回は、CloudFront 1 つで静的サイトと API を同居させたときの落とし穴を、スライドにまとめる予定。
