---
title: "MySQL の ERROR 1038 Out of sort memory：8.0.28 より前は最大行の 15 倍のソートバッファが必要"
summary: JSON 列を含むテーブルの ORDER BY で ERROR 1038 が出た。MySQL 8.0.28 で直ったバグで、既定の sort_buffer_size（256KB）だと約 17KB を超える行で落ちうる。原因の読み方と、取った対処を書く。
publishedAt: 2023-07-06T21:00:00+09:00
tags: [mysql]
---

# はじめに

この記事は 2023-07-06 に [Qiita](https://qiita.com/elys0912/items/46ae8ac66d9b22801f43) に書いたものを、本ブログに移して修正した。修正にあたって、一次資料の確認は AI（Claude Code）と壁打ちしながら進めている。

先に結論を書いておく。

- MySQL 8.0.28 より前には、JSON や TEXT の列を含むソートで「ソートバッファが最大行の 15 倍ないと足りなくなる」バグがある。8.0.28 で「最大のソートキーの 15 倍」に緩められた
- 既定の `sort_buffer_size` は 256KB なので、256KB ÷ 15 で約 17KB を超える行がソートに混ざると ERROR 1038 が出うる
- 今回は JSON 列に入る値の大きさを API 側で 4KB までに制限して避けた。根本は MySQL を上げること

# 起きたこと

JSON 型の列を持つテーブルに `ORDER BY` を付けた検索で、次のエラーが出たと報告があった。

```
ERROR 1038 (HY001): Out of sort memory, consider increasing server sort buffer size
```

JSON 列には、想定よりかなり大きいデータが入っていたらしい。本番のデータを直接見られる立場ではなく、どんな値が入っていたかはざっくりとしか教えてもらえなかった。手元で再現させる材料が少ないので、まずは公式の資料から当たりを付けることにした。

エラーの文面は「ソートバッファを増やせ」と言っている。とはいえ、ソートする件数が特別多いわけではなかったので、件数ではなく 1 行の大きさが効いているのではないか、という見立てで調べている。

# 原因：8.0.28 で直ったバグ

MySQL 8.0.28 のリリースノート（2022-01-18）の Data Type Notes に、そのものの記述がある。

> Sorts of some column types, including JSON and TEXT, sometimes exhausted the sort buffer if its size was not at least 15 times that of the largest row in the sort. Now the sort buffer need only be only 15 times as large as the largest sort key. (Bug #103325, Bug #105532, Bug #32738705, Bug #33501541)

訳すとこうなる。

> JSON や TEXT を含むいくつかの列の型のソートで、ソートバッファの大きさがソート対象の最大行の 15 倍以上ないと、ソートバッファを使い果たすことがあった。修正後は、ソートバッファは最大のソートキーの 15 倍あればよい。

同じ項目には、以前の修正（Bug #30400985、Bug #30804356）で入ったデグレだと書かれている。つまり、8.0.28 より前の一部のバージョンで起きる不具合で、8.0.28 以降なら条件が緩くなっている。

| | 8.0.28 より前（不具合あり） | 8.0.28 以降 |
|---|---|---|
| ソートバッファに必要な大きさ | ソート対象の最大行 × 15 | 最大のソートキー × 15 |
| 効いてくるもの | 行に含まれる JSON・TEXT の大きさ | ORDER BY に使うキーの大きさ |

# なぜ 15 倍なのか

`sort_buffer_size` の説明に、最低限の大きさの決まりがある。

> At minimum the sort_buffer_size value must be large enough to accommodate fifteen tuples in the sort buffer.

ソートバッファには、少なくとも 15 個のタプル（ソート用に詰めた 1 行分のデータ）が入らないといけない。バグのあるバージョンでは、このタプルの大きさを見積もるときに行全体の大きさが使われていた、と読める。

`ORDER BY` の最適化の説明を見ると、ソートバッファのタプルには、ソートキーだけでなくクエリが参照する列まで入れる方式（`<sort_key, additional_fields>`）がある。大きな JSON 列を SELECT しているクエリなら、その列ごとバッファに載ることになる。今回のエラーも、行に含まれる JSON 列の大きさで 15 倍の条件を割り込んだようだ。

![ソートバッファ 256KB の中に、修正前は最大行 15 個分、修正後は最大ソートキー 15 個分が入る必要があることを示す図。256KB ÷ 15 は約 17KB](/images/mysql-out-of-sort-memory/sort-buffer.png)

# 既定値で計算すると約 17KB

`sort_buffer_size` の既定値は 262,144 バイト（256KB）。ここから、1 行に許される大きさを逆算するとこうなる。

| 項目 | 値 |
|---|---|
| `sort_buffer_size` の既定値 | 262,144 バイト（256KB） |
| 必要なタプルの数 | 15 |
| 1 行あたりの上限 | 262,144 ÷ 15 ＝ 約 17,476 バイト（約 17KB） |

バグのあるバージョンでは、ソート対象に約 17KB を超える行が 1 つでも混ざると、件数に関係なくエラーになりうる。元の記事では「約 17KB を超えるカラム」と書いたが、条件はあくまで行の大きさで、JSON 列の値に他の列の分を足した大きさで見られる。列単体で 17KB を切っていても安心はできない。

修正後の条件はソートキーの大きさなので、日時や ID のような短い列で並べるクエリなら、JSON 列の大きさには引っ張られなくなるはず。

# 対処

取れる手は 3 つあった。

| 対処 | 効き方 | 気になる点 |
|---|---|---|
| JSON 列に入る値の大きさを制限する | 行が 17KB を超えなくなる | 制限前に入ったデータは別に直す必要がある |
| `sort_buffer_size` を上げる | 15 倍の条件を満たしやすくなる | 全体で上げるとソートするクエリ全般が遅くなりうる |
| MySQL を 8.0.28 以降に上げる | 条件そのものが緩くなる | 本番のアップデートは段取りが重い |

今回は 1 つ目を取った。JSON 列に入る値の大きさを制限していなかったので、API の内部処理で 4KB 以下に制限している。4KB なら他の列を足しても 17KB には遠く、当面はこれで回せるかな。

2 つ目は、公式の説明に「全体で必要以上に大きくするとソートを行うクエリの多くが遅くなる。必要なセッションだけで上げるのがよい」という趣旨の注意がある。Linux では 256KB と 2MB に、超えるとメモリの確保が遅くなりうる境目があるとも書かれている。上げるなら、問題のクエリを流すセッションだけで `SET SESSION sort_buffer_size = <バイト数>` とするのが筋だと思う。

根本の対処は 3 つ目で、将来の MySQL のアップデートで片付けたい。

# まとめ

- ERROR 1038 が JSON・TEXT 列を含むソートで出たら、まず MySQL のバージョンを見る。8.0.28 より前なら、このバグを疑ってよい
- バグのあるバージョンでは、ソートバッファに最大行の 15 倍が必要。既定の 256KB なら 1 行約 17KB が境目
- 条件は列単体でなく行の大きさ。大きな値が入る列は、入口で大きさを制限しておくと安全
- `sort_buffer_size` を上げるなら、全体ではなくセッション単位で

エラー文の「バッファを増やせ」を素直に聞く前に、リリースノートを引くと話が早いよ。

# 参考

- [MySQL 8.0.28 Release Notes（Data Type Notes）](https://dev.mysql.com/doc/relnotes/mysql/8.0/en/news-8-0-28.html#mysqld-8-0-28-data-types)
- [MySQL 8.0 Reference Manual：Server System Variables（sort_buffer_size）](https://dev.mysql.com/doc/refman/8.0/en/server-system-variables.html#sysvar_sort_buffer_size)
- [MySQL 8.0 Reference Manual：ORDER BY Optimization](https://dev.mysql.com/doc/refman/8.0/en/order-by-optimization.html)
- 元の記事で引用した記事：[ERROR 1038 (HY001): Out of sort memory, consider increasing server sort buffer size](https://donbulinux.hatenablog.jp/entry/2023/06/20/205135)
