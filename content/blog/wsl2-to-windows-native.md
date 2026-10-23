---
title: "開発環境を WSL2 から Windows ネイティブに移した"
summary: git の改行コードと長パス、PowerShell が使えない環境での Git Bash 運用、Linux の道具が無いことへの対処など、移行でつまずいた点と決めたことを書く。
publishedAt: 2026-10-13T21:00:00+09:00
tags: [windows]
---

# はじめに

2026-10-09 に、開発環境を WSL2 から Windows ネイティブに移した。WSL2 は Linux がそのまま動くので楽だったが、手元の事情で使い続けられなくなった。同じリポジトリ群を Windows 側に置き直して、道具も全部ネイティブに揃え直している。

移行そのものは 1 日で終わったが、細かい落とし穴がいくつもあった。先に知っていれば迷わなかったものを書いておく。作業は AI（Claude Code）と壁打ちしながら進めた。

# git：改行コードを持ち込まない

一番気を使ったのは改行コード。WSL2 時代のリポジトリは全部 LF で、これを Windows に持ってきた瞬間に CRLF が混ざるのがお決まりの事故。

対策はリポジトリごとに設定を固定すること。

```
git config core.autocrlf false
git config core.longpaths true
git config core.quotepath false
```

- `autocrlf=false`：git に改行の変換をさせない。全ファイル LF のまま運ぶ。エディタ側も LF 固定にしておく
- `longpaths=true`：Windows の 260 字のパス制限への保険。OS 側でも `LongPathsEnabled` を有効にしてある
- `quotepath=false`：日本語のファイル名が `\343\201\202` のような 8 進数のエスケープで出るのを止める。日本語パスのあるリポジトリでは必須

autocrlf は「true にして Windows に合わせる」という解説も多いが、CI は Linux で動くし、他の環境と行き来するなら LF で統一するほうが事故が少ない。変換を挟まないのが一番わかりやすいんだよな。

# シェル：PowerShell が使えないので Git Bash

手元の環境では PowerShell が使えない。なので日常のシェルは Git Bash にした。`/c/dev/...` の表記でだいたいの操作はできて、`date` も日本時間で返ってくる。

ただし Git Bash は Linux ではないので、無いものがある。

| 無いもの | 代わり |
|---|---|
| `/proc` | `tasklist` などの Windows コマンド |
| `apt` | インストーラーを個別に入れる |
| `pkill` | `taskkill` |
| inotify（ファイル監視） | ポーリングか、各ツールの Windows 対応 |

スクリプトで `/proc` や `pkill` を前提にしていたものは、ここで一度ずつ壊れた。壊れてから直せば十分だったが、監視系だけは作りが変わるので先に確かめておくとよい。

# 言語・ツールはネイティブに揃え直す

node・npm・docker・Java 17 はネイティブ版を入れ直した。Python は 3.11 系で、Excel を扱う都合で openpyxl と pywin32 を入れてある。COM が直接呼べるのは Windows ネイティブの利点で、WSL2 時代は Excel 絡みだけ別の経路を作っていたのが一本化された。

Maven はグローバルに入れず、各リポジトリの `mvnw.cmd` を使う。リポジトリに版が固定されるので、環境を作り直すたびに合わせる手間がない。

# 残骸の掃除

WSL2 時代の生成物（node_modules、ビルドキャッシュ）は移行先に持ち込まず、消す対象の一覧を先に TSV に書き出してから消した。何を消したかが残るので、後から「あれはどこへ行った」となったときに追える。

# まとめ

- 改行コードは autocrlf で変換せず、全ファイル LF で統一する
- 長パスと日本語パスの設定は最初に済ませる
- Git Bash は Linux ではない。/proc・pkill・inotify 前提のものは壊れる
- ビルドツールはリポジトリ同梱のラッパー（mvnw など）に寄せる

WSL2 のほうが楽な場面はまだあるが、Excel の COM が直接触れるなど、ネイティブにはネイティブの良さもある。環境の制約で移る人の参考になれば。
