---
title: "自作の拡張をどこから配るか：AMO の審査と Releases への切り替え"
summary: Firefox 拡張の InariMCP を AMO で公開し、0.2.0 の審査も通った。同じ週に、Mastodon 向けのユーザースクリプトは配布元を main ブランチから GitHub Releases に変えた。どちらも「使う人の手元に何が届くか」を決める話だった。
publishedAt: 2026-10-29T22:12:00+09:00
tags: [firefox, mastodon, frontend]
---

# はじめに

今週、自作の拡張の配り方を 2 つ決めた。

- Firefox 拡張の InariMCP は、AMO（addons.mozilla.org）に一覧掲載で出した。0.1.0 に続いて、0.2.0 の審査も通った
- Mastodon の投稿欄を拡張するユーザースクリプトは、配布元を main ブランチから GitHub Releases に変えた

片方はストアの審査、片方はただのファイルの置き場所で、規模はだいぶ違う。ただ、どちらも「使う人の手元に何が、いつ届くか」をこっちで決める話だったので、まとめて書いておく。

# AMO に出すまで

## listed と unlisted

AMO に出す拡張は、署名の受け方が 2 つある。

- listed：ストアの検索に出る。人による審査が入る
- unlisted：署名だけもらって、配布は自分でやる。ストアには出ない

自分専用で使っている別の拡張は unlisted にしている。権限を緩くしてなんでもできるようにしてあるので、ストアの規約にはまず通らない。InariMCP は最初から AMO で公開するつもりで作ったので、listed にした。

## 規約は 3 つ読む

審査で見られるのは、主に次の 3 つの文書だ。

1. AMO Policies
2. Firefox Add-on Distribution Agreement
3. Add-on Policies

重いのは、データの収集と送信を開示して同意を取ること、外から届いたコードを実行しないこと、コードを難読化しないこと。unlisted でも 2 と 3 は適用されるので、ストアに出さないから関係ない、というわけでもない。

## 提出で踏んだところ

0.1.0 の提出（2026-10-14）では、何か所かつまずいた。

- 審査担当者向けのメモ（Notes for Reviewers）は 3000 文字まで。用意していた説明は 8000 文字を超えていたので、短い版を書いて、そこから全文へリンクした
- API で画像や説明を続けて登録していたら 429 が返ってきた。1 時間あたりの上限に当たると 50 分ほど待たされる。途中から再開できない作りだったので、結局残りは Developer Hub の画面から手で入れた
- プライバシーポリシーの欄が見つからなかった。「製品ページを編集」ではなく、「作者とライセンスを管理」のほうにある

0.1.0 は 2026-10-19 に公開を確認できた。

![AMO の Inari MCP for Firefox の掲載ページ。アイコン、作成者、拡張の説明、「Firefox へ追加」のボタン、スクリーンショット 2 枚が並んでいる](/images/addon-distribution-amo-and-releases/amo-listing.png)

## 0.2.0 は差分を小さく出す

0.2.0 は 2026-10-23 に出して、2026-10-27 に承認された。

![Developer Hub の「ステータスとバージョン」の画面。公開バージョンが 0.2.0 で状態は承認済み、検証は 0 個のエラーと 0 個の警告。0.1.0 も承認済みのまま「他のバージョン」に並んでいる](/images/addon-distribution-amo-and-releases/amo-versions.png)

審査は前の版からの差分を見る。そこで、使う人に見える変更だけを入れて、内部の整理は次に回した。差分が大きいほど審査する側の負担も増えるし、通るまでの時間も読みにくくなる。

アイコンを自分で作ったブログに合わせて修正した
気軽に初心者でも使えるようにやさしい説明に書き換えた。

# ユーザースクリプトは Releases から配る

## main への push がそのまま配布になっていた

ユーザースクリプトは、Tampermonkey が `@updateURL` を見に行って、新しい版があれば自動で更新する。これまでは、この URL が main ブランチの生のファイルを指していた。

つまり、main に push した瞬間に、使っている人全員へ配られる。確認が済む前のものでも届いてしまう。

## releases/latest/download を指す

v3.2.0 で、`@updateURL` と `@downloadURL` を Releases の添付ファイルの URL に変えた。

```
https://github.com/elys0912/imastodon-inline-visibility/releases/latest/download/...
```

`releases/latest/download` は、最新のリリースの添付を指す固定の URL になる。版を出す手順は、PR でマージする、実機で確かめる、`gh release create` で添付する、の順にした。main に入っても、リリースを作るまでは誰にも届かない。

![GitHub の v3.2.0 のリリースの画面。変更点の説明の下の Assets に、imastodon-inline-visibility.user.js とソースコードの zip・tar.gz が添付されている](/images/addon-distribution-amo-and-releases/github-release.png)

## 切り替えは 1 回だけ main から配る

困るのは、すでに入れている人の更新先が main のままなこと。そこで 3.2.0 だけは main から配った。この版に自動更新されると、スクリプトの中の更新先が Releases に変わる。

それでも切り替わらない環境のために、README と CHANGELOG に「1 回だけ入れ直してください」という案内を書いた。

# おわりに

ストアに出すのも、置き場所を変えるのも、やっていることは同じで、「確かめたものだけが届く」ようにすることだった。AMO では審査がその役を担ってくれて、ユーザースクリプトではリリースを切る手順が担う。

思ったより更新は簡単だったので、これからも続けてアップデートしていきたい。Firefox のユーザーが増えますように。
