---
title: "Secrets Manager のクライアント情報で外部 API のトークンを取り、API Gateway のステージ変数に入れる Lambda"
summary: OAuth 2.0 のクライアントクレデンシャルでトークンを取り、API Gateway のステージ変数に 500 字ずつ分けて入れる Lambda のサンプル。元のコードを載せたうえで、失敗時の扱い、json.loads、Secret のまとめ方、長いトークン、ステージ変数に置く是非を見直した「今ならこう書く」版を付ける。
publishedAt: 2024-10-01T21:00:00+09:00
tags: [aws, python, security]
---

# はじめに

この記事は 2024-10-01 に [Qiita](https://qiita.com/elys0912/items/f6349262a3ad968de49e) に書いたものを、本ブログに移して修正した。修正にあたって、AWS のドキュメントの確認とコードの見直しは AI（Claude Code）と壁打ちしながら進めている。

元の記事はコードを貼っただけだったので、構成の説明と、今の目で見直した改善版を足した。先に要点を書いておく。

- Secrets Manager からクライアント ID とシークレットを取り、外部の認可サーバーからアクセストークンを取って、API Gateway のステージ変数に書き込む Lambda
- ステージ変数の値には長さの上限があるので、トークンを 500 字ずつに分けて入れている
- 今なら、失敗時に何も書かない、`json.loads` で読む、Secret を 1 つにまとめる、長さを超えたら止める、の 4 点は直す。ステージ変数にトークンを置くこと自体も、AWS のドキュメントでは勧められていない

# やりたかったこと

外部の API を API Gateway 経由で呼ぶ構成で、外部 API の呼び出しには OAuth 2.0 のアクセストークンが必要。トークンはクライアントクレデンシャル（`grant_type=client_credentials`）で取る形式だった。

- クライアント ID とクライアントシークレットは Secrets Manager に置く
- Lambda がそれを読み、外部の認可サーバーにトークンを取りに行く
- 取ったトークンを API Gateway のステージ変数に書き込み、API Gateway から外部 API を呼ぶときに使う

![Secrets Manager から Lambda がクライアント ID とシークレットを取り、外部の認可サーバーからアクセストークンを受け取って、API Gateway のステージ変数に分割して書き込む構成図](/images/lambda-secrets-manager-oauth-token/architecture.png)

# 元のコード

Qiita に載せたものをそのまま置く。Python で、HTTP は標準の `urllib` で書いている。

```python
import json
import ast
import boto3
import urllib.request
import urllib.parse
import base64
import os
import logging
from botocore.exceptions import ClientError

logging.basicConfig(
    format='%(asctime)-15s %(levelname)s %(message)s',
    level=logging.INFO
)

# AWSクライアント
apigw_client = boto3.client("apigateway")

# リージョン取得
region_name = os.environ['AWS_DEFAULT_REGION']

# API GatewayのIDを環境変数から取得
apigw_id = os.environ['APIGW_ID']

# 格納先のAPI Gatewayステージ変数キー
apigw_stagevalue_key = os.environ['APIGW_VALUE_KEY']

# 外部APIエンドポイント
target_url = os.environ['TARGET_API_URL']

# 格納先変数名
value_name = os.environ['VALUE_NAME']

# Secrets Managerで管理する値の名前
secret_name = "target-clientsecret"
target_client_id = "target-clientid"

# 外部API実行処理
def get_target_token():
    session = boto3.session.Session()
    client = session.client(
        service_name='secretsmanager',
        region_name=region_name
    )
    # Secrets Manager からSecretを取得
    try:
        get_secret_client_secrets_response = client.get_secret_value(
            SecretId=secret_name
        )
        get_secret_secrets_id_response = client.get_secret_value(
            SecretId=target_client_id
        )
        secret_client_secrets_data = get_secret_client_secrets_response['SecretString']
        secret_secrets_id_data = get_secret_secrets_id_response['SecretString']
        secretClientSecrets = ast.literal_eval(secret_client_secrets_data)
        secretClientID = ast.literal_eval(secret_secrets_id_data)
        clientSecret = secretClientSecrets['targetClientSecret'] #シークレット
        clientId = secretClientID['targetClientId'] #クライアントID
    except ClientError as e:
        logging.error(e)
        return "error"
        
    # トークン取得リクエスト（対象の外部APIによって編集する）
    credentials = base64.b64encode((clientId + ":" + clientSecret).encode()).decode()
    headers = {
        'Accept': 'application/json',
        'Authorization': 'Basic ' + credentials,
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    data = {'grant_type':'client_credentials'}
    req = urllib.request.Request(target_url, headers=headers, data=urllib.parse.urlencode(data).encode('utf-8'), method='POST')
    
    # リクエスト実行
    try:
        with urllib.request.urlopen(req) as response:
            body = response.read()
            value = json.loads(body.decode('utf-8'))["access_token"]
            return value
    except urllib.error.HTTPError as err:
        logging.error(err)
        return "error"

def lambda_handler(event, context):
    # 外部APIを実行してtokenを取得
    token = get_target_token()
  
    # 設定ファイル書き換える
    if len(token) < 500:
        response = apigw_client.update_stage(
            restApiId=apigw_id,
            stageName=apigw_stagevalue_key,
            patchOperations=[
                {
                    'op': 'replace',
                    'path': '/variables/' + value_name,
                    'value': token
                }
            ]
        )
    else:
        # ステージ変数が500文字制限があるので、500文字で分割
        split_token_arr = [token[x:x+500] for x in range(0, len(token), 500)]
        patch_operations = [
            {
                'op': 'replace',
                'path': '/variables/' + value_name + "0",
                'value': split_token_arr[0]
            }
        ]
        if len(split_token_arr) > 1:
            patch_operations.append(
                {
                    'op': 'replace',
                    'path': '/variables/' + value_name + "1",
                    'value': split_token_arr[1]
                }
            )
        #  ステージ変数に値を格納
        response = apigw_client.update_stage(
            restApiId=apigw_id,
            stageName=apigw_stagevalue_key,
            patchOperations=patch_operations
        )
    # 終了
    return {
        'statusCode': 200,
        'body': token
    }
```

流れは次のとおり。

1. Secrets Manager から、シークレットとクライアント ID を別々の Secret として取る
2. `クライアント ID:シークレット` を Base64 にして Basic 認証のヘッダーを作り、`grant_type=client_credentials` で認可サーバーに POST する
3. 応答の JSON から `access_token` を取り出す
4. `update_stage` の `replace` で、ステージ変数にトークンを書き込む。500 字以上なら 500 字ずつに分けて、`<変数名>0`、`<変数名>1` に入れる

# ステージ変数の長さの上限

分割しているのは、ステージ変数の値に長さの上限があるため。元の記事では「500 文字制限」と書いた。今の API Gateway のクォータの表（REST API）では、ステージ変数の値の長さは 512 字で、引き上げはできない。コードの 500 字ずつの分割は、この上限に収まっている。

| 項目 | 上限（REST API） |
|---|---|
| ステージごとのステージ変数の数 | 100 |
| ステージ変数のキーの長さ | 64 字 |
| ステージ変数の値の長さ | 512 字 |

長さのほかに、使える文字にも決まりがある。CloudFormation のリファレンスでは、値は `[A-Za-z0-9-._~:/?#&=,]+` に合うこと、とされる。JWT のトークンは Base64URL なので収まるが、`+` を含む形式のトークンだと書き込めないはず。

# 今ならこう書く

今の目で読み直すと、気になる点がいくつかある。

| 気になる点 | 何が起きるか | 直し方 |
|---|---|---|
| 失敗時に文字列 "error" を返す | "error" がそのままステージ変数に書き込まれ、まだ有効だったトークンを上書きする | 例外を投げて、ステージ変数には何も書かない |
| `ast.literal_eval` で SecretString を読む | JSON の `true`・`false`・`null` を含むと読めない。そもそも Python のリテラルとして読む理由がない | `json.loads` で読む |
| クライアント ID とシークレットが別の Secret | 取得が 2 回になる。片方だけ更新されると組がずれる | 1 つの Secret に JSON でまとめる |
| 3 つ目以降の分割が捨てられる | 1,000 字を超えるトークンが黙って切り詰められる | 収まらなければ止める |
| 長さで変数名が変わる | 500 字未満は `<変数名>`、以上は `<変数名>0`・`<変数名>1` に入り、読む側が両方に備える必要がある | 常に同じ名前の並びに入れる |
| トークンを戻り値に入れる | 呼び出し元やテスト実行の結果にトークンが出る | 長さだけ返す |

細かい点では、`apigw_stagevalue_key` という名前の環境変数を `stageName` に渡していて、名前と中身が合っていない。直すならステージ名として名前を付け直す。

## 失敗したら何も書かない

一番まずいのはここ。Secrets Manager の取得か、認可サーバーへのリクエストが失敗すると、`get_target_token` は文字列 "error" を返す。"error" は 5 字なので `len(token) < 500` に入り、そのまま `update_stage` でステージ変数に書き込まれる。

前回取ったトークンはまだ期限内かもしれないのに、それを "error" で上書きしてしまう。その後は次の実行で成功するまで、API Gateway からの呼び出しが全部認証で落ちることになる。しかも Lambda 自体は `statusCode: 200` で正常に終わるので、失敗に気づきにくい。

失敗したら例外をそのまま投げて、ステージ変数には触らないのが筋。前回のトークンが残っていれば期限までは動くし、Lambda の失敗としてメトリクス（Errors）に出るので、アラームも張れる。

## SecretString は json.loads で読む

Secrets Manager の `GetSecretValue` の説明には、コンソールで作った Secret は、キーと値の組を JSON の構造として保存する、とある。JSON なら `json.loads` で読むのが素直。

`ast.literal_eval` は Python のリテラルを読む関数で、JSON の `true`・`false`・`null` を知らない。値が文字列だけなら偶然読めてしまうので、元のコードでは問題が表に出なかったんだよな。

## Secret は 1 つにまとめる

クライアント ID とシークレットは必ず組で使うので、1 つの Secret に JSON でまとめておく。

```json
{"client_id": "…", "client_secret": "…"}
```

取得が 1 回で済み、シークレットを入れ替えるときに ID と食い違う時間もなくなる。

## 長いトークンを黙って切らない

元のコードは、500 字ずつに分けたうち先頭の 2 つしか書き込まない。1,000 字を超えるトークンは 3 つ目以降が捨てられ、途中で切れたトークンが入る。

API Gateway 側で連結するステージ変数の数は決まっているはずなので、その数を設定で持ち、収まらなければ書き込まずに失敗させる。前回より短いトークンになったときに、古いトークンの後ろ半分が残らないよう、使わない変数を消す処理も足しておく。

## 改善版のコード（未検証）

上の点を直したもの。手元に動かせる環境がないので、動作は確かめていない。使う場合は、必ず検証環境で試してほしい。特に、存在しないステージ変数への `remove` がエラーになるかどうかは確かめていない。

```python
import base64
import json
import logging
import os
import re
import urllib.parse
import urllib.request

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SECRET_ID = os.environ["SECRET_ID"]  # client_id と client_secret を JSON で持つ 1 つの Secret
TOKEN_URL = os.environ["TOKEN_URL"]
REST_API_ID = os.environ["REST_API_ID"]
STAGE_NAME = os.environ["STAGE_NAME"]
VARIABLE_PREFIX = os.environ["VARIABLE_PREFIX"]  # 例: token → token0, token1
MAX_PARTS = int(os.environ.get("MAX_PARTS", "2"))  # API Gateway 側で連結する数に合わせる

PART_LENGTH = 500  # ステージ変数の値の上限（512 字）に収める
ALLOWED_VALUE = re.compile(r"[A-Za-z0-9\-._~:/?#&=,]+")
TIMEOUT_SECONDS = 10

secrets_client = boto3.client("secretsmanager")
apigw_client = boto3.client("apigateway")


def load_client_credentials():
    response = secrets_client.get_secret_value(SecretId=SECRET_ID)
    secret = json.loads(response["SecretString"])
    return secret["client_id"], secret["client_secret"]


def fetch_access_token(client_id, client_secret):
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    request = urllib.request.Request(
        TOKEN_URL,
        data=urllib.parse.urlencode({"grant_type": "client_credentials"}).encode(),
        headers={
            "Accept": "application/json",
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    # HTTP のエラーは例外のまま上に投げる。ステージ変数には何も書かない
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        body = json.loads(response.read().decode("utf-8"))

    token = body.get("access_token")
    if not token:
        raise ValueError("応答に access_token が無い")
    return token


def build_patch_operations(token):
    if not ALLOWED_VALUE.fullmatch(token):
        raise ValueError("ステージ変数に使えない文字がトークンに含まれる")

    parts = [token[i:i + PART_LENGTH] for i in range(0, len(token), PART_LENGTH)]
    if len(parts) > MAX_PARTS:
        raise ValueError(f"トークンが {len(token)} 字あり、{MAX_PARTS} 個のステージ変数に収まらない")

    operations = [
        {"op": "replace", "path": f"/variables/{VARIABLE_PREFIX}{i}", "value": part}
        for i, part in enumerate(parts)
    ]

    # 前回より短いトークンのとき、古いトークンの後ろが残らないように消す
    operations += [
        {"op": "remove", "path": f"/variables/{VARIABLE_PREFIX}{i}"}
        for i in range(len(parts), MAX_PARTS)
    ]
    return operations


def lambda_handler(event, context):
    client_id, client_secret = load_client_credentials()
    token = fetch_access_token(client_id, client_secret)

    apigw_client.update_stage(
        restApiId=REST_API_ID,
        stageName=STAGE_NAME,
        patchOperations=build_patch_operations(token),
    )

    # トークンそのものはログにも戻り値にも出さない
    logger.info("ステージ変数を更新した（%d 字）", len(token))
    return {"updated": True, "length": len(token)}
```

変えたところをまとめるとこうなる。

- 失敗はすべて例外にした。`update_stage` まで進まないので、前回のトークンは残る
- Secret は 1 つにまとめ、`json.loads` で読む
- 書き込む変数名は、長さに関係なく常に `<接頭辞>0`、`<接頭辞>1`、… にした
- 収まらない長さや、使えない文字を含むトークンは書き込まずに止める
- `urlopen` にタイムアウトを付けた。外部の認可サーバーが応答しないとき、Lambda のタイムアウトまで待たされないように
- boto3 のクライアントは関数の外で 1 回だけ作る

# ステージ変数にトークンを置くことの是非

コードを直しても残る問題がある。そもそもステージ変数にトークンを置いてよいのか、という点。

API Gateway のステージ変数の説明には、ステージ変数は認証情報のような機密のデータに使うためのものではない、と書かれている。機密のデータを統合に渡すなら、Lambda オーソライザーの出力で渡すように、とも案内されている。

ステージ変数に置くと、次のような点が気になる。

- ステージの設定を読める権限があれば、トークンが平文で見える。コンソールのステージの画面にも出る
- 設定の変更として扱われるので、トークンを入れ替えるたびにステージを書き換えることになる
- 長さの上限があるので、今回のように分割と連結の仕組みが必要

とはいえ、Lambda オーソライザーに寄せると、オーソライザーの Lambda を別に用意し、トークンの持ち方や結果のキャッシュも考えることになるので、構成はひと手間増える。トークンの寿命が十分長く、ステージの設定を読める人が限られているなら、割り切って使う選択もあると思う。今から作るなら、まずはドキュメントの勧める形で組めないかを検討して、無理なら理由を残したうえでステージ変数にするかな。

# まとめ

- Secrets Manager の値でクライアントクレデンシャルのトークンを取り、ステージ変数に分けて入れる Lambda を書いた
- ステージ変数の値の上限は、今のクォータの表では 512 字。使える文字にも決まりがある
- 失敗時に "error" を返してそのまま書き込む作りは、有効なトークンを壊す。失敗したら何も書かない
- SecretString は JSON なので `json.loads` で読む。組で使う値は 1 つの Secret にまとめる
- 分割は、収まらなければ止める。黙って切り詰めない
- ステージ変数は機密のデータ向けではない。置くなら割り切りの理由を残す

動いていたコードでも、失敗したときの道筋まで読むと直したいところが結構ある。自分の昔のコードを読み返すのは、なかなか気が重い。

# 参考

- [Quotas for configuring and running a REST API in API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-execution-service-limits-table.html)
- [Use stage variables for a REST API in API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/stage-variables.html)
- [AWS::ApiGateway::Stage（CloudFormation）](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-apigateway-stage.html)
- [GetSecretValue（AWS Secrets Manager API Reference）](https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html)
