---
title: "CloudFront 1 つで静的サイトと API を同居させた時の落とし穴"
summary: S3 の静的サイトと API Gateway の API を 1 つの CloudFront の下に置いた。errorResponses が /api/* にも効く、OAC に LIST を足して 404 にする、execute-api への直接アクセスを塞ぐ、ロググループがロールバックで消える、の 4 つの落とし穴をスライドにまとめた。
publishedAt: 2026-09-26T12:30:00+09:00
marp: true
theme: default
paginate: true
---

# CloudFront 1 つで静的サイトと API を同居させた時の落とし穴

- S3 の静的サイトと API Gateway の API を 1 つの CloudFront に
- 初回デプロイまでに踏んだ 4 つの落とし穴
- AI（Claude Code）と壁打ちしながら直した。決めたのは自分

---

## 構成

```
Browser ─ CloudFront ─┬─ /*      → S3（静的サイト、OAC）
                      └─ /api/*  → API Gateway HTTP API → Lambda → Aurora DSQL
```

- 既定のビヘイビアは S3。キャッシュは標準の最適化
- `/api/*` は HTTP API。キャッシュ無効、Host 以外のヘッダーを転送、全メソッドを許可
- 同じオリジンから配るので、ブラウザは `/api/` を相対パスで呼べる

---

## 落とし穴 1：errorResponses は全体にかかる

- OAC 経由の S3 は、存在しないキーを 403 で返す
- そこで「403 → 404 ページ」を errorResponses に書いていた
- ところが errorResponses はビヘイビアごとじゃなく、ディストリビューション全体に効く
- `/api/*` の 403 まで 404 に化けて、将来の管理 API の認可エラーが見えなくなる

---

## 直し方：S3 に 404 を返させる

- OAC のアクセスレベルに LIST を足す
- `s3:ListBucket` をバケットの ARN に、このディストリビューションの SourceArn 条件付きで許可
- これで存在しないキーが 403 じゃなく 404 で返る
- 403 → 404 の置き換えをやめ、404 → `/404.html` だけ残す
- API の 404 も本文は HTML になるが、ステータスは 404 のまま。frontend はステータスしか見ないのでセーフ
- エラー応答のキャッシュは 10 秒に。公開直後の記事が見えない時間を短くする

---

## 落とし穴 2：execute-api に直接アクセスできる

- HTTP API には CloudFront を通らない既定のエンドポイントがある
- 直接呼ばれると、CloudFront で付けたヘッダーも、CloudFront が決めた閲覧者の IP も信用できない
- `disableExecuteApiEndpoint` は、カスタムドメインがないと CloudFront のオリジンにも使えなくなるので選べない

---

## 直し方：origin-verify ヘッダー

- CloudFront が `/api/*` のオリジンへのリクエストに `X-Origin-Verify` を付ける
- backend のフィルタが検証し、無いか値が違えば 403。比較は定数時間
- 閲覧者が同じ名前のヘッダーを送っても CloudFront が上書きする
- `/api/health` だけは除外。監視と SnapStart の priming がヘッダーなしで呼ぶため

---

## 値の置き場：SSM の String パラメータ

- CloudFormation の動的参照で `{{resolve:ssm:/name:N}}` とだけ書く。テンプレートに値は入らない
- SecureString の動的参照は、CloudFront のカスタムヘッダーでは使えない
- バージョンを固定する。上げると CloudFront の設定と Lambda の環境変数が変わり、両方が作り直される
- backend は SnapStart のスナップショットに値を持つので、作り直しが要る

---

## 閲覧者の IP も CloudFront で確定させる

- `CloudFront-Viewer-Address` は、マネージドの「Host 以外を転送」のポリシーでは届かない
- 閲覧者が自分で付けた同名のヘッダーは素通しで届く
- viewer request の CloudFront Function で、独自のヘッダーを `event.viewer.ip` で必ず上書きする
- 同名のヘッダーが複数あるときの `multiValue` も 1 つに潰す
- origin-verify と組で初めて「CloudFront を経由し、CloudFront が決めた IP」だけを信用できる

---

## 落とし穴 3：乱数が全ゼロだった

- origin-verify の値は手元で乱数を作って SSM に登録する手順
- 最初の登録（Version 1）が全ゼロ。シェルの乱数生成でエラーが出ていたのを見落とした
- 正しい乱数で上書きした Version 2 を参照するよう cdk.json を変えた
- 秘密の値は「登録した」じゃなく「登録した値を確認した」まで

---

## 落とし穴 4：ロググループがロールバックで消える

- Lambda の起動失敗でスタックがロールバックすると、一緒に作ったロググループも消える
- 原因を追うためのログが、原因が起きたときに消えるのはひどすぎる
- マイグレーション用と API の両方の Lambda で、removalPolicy を RETAIN に
- 名前は自動で付ける。固定すると、残ったロググループと次の作成がぶつかる
- 中身は保持期間（30 日）で消える

---

## AI との付き合い方

- errorResponses の範囲は、最初の設定だと考慮から抜けていた
- 直し方の選択肢（LIST を足す、403 を残す、TTL）は AI に並べさせ、決めたのは自分
- 「execute-api を無効にすれば済む」案は、カスタムドメインがない前提だと成り立たないとちゃんと確認した
- 乱数の全ゼロは、登録した値を読み戻すまでマジで気づかなかった

---

## まとめ

- 1 つの CloudFront に静的サイトと API を同居させると、ディストリビューション全体の設定が API に効く
- 「CloudFront を通ったこと」は、オリジン側で検証しないと保証されない
- 失敗したときのログは、失敗する前に残るようにしておく
- 次回は、個人開発での Dependabot の運用を書く予定
