---
title: "React の内部から Redux ストアを拾って、Mastodon の Web UI を拡張する"
summary: Mastodon の投稿欄に公開範囲の切り替えボタンを足すユーザースクリプトを書いた。DOM をクリックで真似るのではなく、React の内部から Redux ストアを取り出し、本家と同じアクションを dispatch する方式にした。状態がずれない代わりに、本家の更新で壊れうるというトレードオフの話。
publishedAt: 2026-09-14T21:00:00+09:00
---

# はじめに

普段使っている Mastodon のサーバーが 4.5 系になり、投稿欄の公開範囲ボタンが「公開範囲と引用」のダイアログに変わった。公開範囲と引用範囲を一緒に決められるのはいいが、毎回ダイアログを開くのは流石に手間。そこで、投稿欄のボタンを並んだアイコンの列に置き換え、ワンクリックで切り替えられる Tampermonkey 用のユーザースクリプトを書いた。

この記事では、その中核の「React の内部から Redux ストアを拾う」部分を書く。設計の相談は AI（Claude Code）と壁打ちしながら進めたが、どの方式を採るかは自分で決めた。

# DOM を真似るか、ストアを叩くか

やり方は 2 つ考えた。

- 本家のダイアログを裏で開き、該当の項目をクリックする
- Mastodon の Web UI が持つ Redux ストアを取り出し、本家と同じアクションを dispatch する

前者は DOM の構造に依存する。ダイアログの文言やクラス名が変わるだけで壊れる。後者も本家の内部にもたれかかる点では同じだが、依存先がアクション名になる分、1 段抽象的。こちらを選んだ。

# findStore の仕組み

React は、自分が管理する DOM 要素に `__reactFiber$` で始まるキーで Fiber ノードをぶら下げている。Fiber は `return` で親をたどれる。Mastodon の Web UI は Redux の `Provider` に `store` を渡しているので、投稿欄のフォーム要素から親方向にたどっていけば、どこかで `memoizedProps.store` に当たる。

```js
const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
let fiber = key ? el[key] : null;
while (fiber) {
  const s = fiber.memoizedProps && fiber.memoizedProps.store;
  if (s && typeof s.dispatch === 'function' && typeof s.getState === 'function') { /* 見つかった */ }
  fiber = fiber.return;
}
```

`dispatch` と `getState` が関数かどうかだけ確かめて、ストアとみなす。見つけたストアは変数に保持し、2 回目以降は探さない。同時に `subscribe` でストアの変化を購読し、ボタンの表示を同期する。

# 本家と同じアクションを dispatch する

ボタンを押したときに投げるのは次の 2 つ。

- 公開範囲：`compose/visibility_change`（payload に `public` などの値）
- 引用範囲：`compose/setQuotePolicy`（payload に `public` / `followers` / `nobody`）

どちらも本家の公開範囲ボタンが投げるものと同じアクションで、Mastodon v4.5.0 のソースを読んで確かめた。アクション名を推測で書くと、一見動いて見えても後で食い違うんだよな。ここはちゃんとソースで裏を取った。

同じアクションを使う利点は、状態がずれないこと。本家側で公開範囲が変わる場面、たとえば返信時に相手の公開範囲へ自動で合わせる処理が走っても、こちらはストアを購読しているだけなので、ボタンの表示が勝手に追従する。自前で状態を持たなくてよい。

状態の読み出しも同じ発想で、`store.getState().compose` から `privacy`、`quote_policy`、編集中かどうかの `id`、引用先の `quoted_status_id` を読む。`compose` は普通のオブジェクトじゃなくて `get` / `getIn` で読む形なので、そこだけ注意した。

# トレードオフ

良いことばかりじゃない。

- `__reactFiber$` は React の内部実装で、公開 API ではない
- `memoizedProps.store` にたどり着く前提も、アクション名も、v4.5.0 のソースに依存している
- サーバーが更新されたら、予告なく動かなくなるかもしれない

これは README にも書いた。自分が使うサーバーのバージョンを前提にした小さな道具で、そこは隠さない。壊れたら直す覚悟込みで、状態がずれない方を取った。

次回は、本家の制約を UI 側でどう再現したかを書く。
