---
title: "GoatCounter でアクセス数を取り直す：登録から CSP、Next.js のページ遷移まで"
summary: 一度は捨てたアクセス数を、ブログとポートフォリオの両方で GoatCounter で取り直した。アカウントとサイトの作り方、集める項目の絞り方、count.js を自分のサイトから配って CSP をほとんど緩めない入れ方、Next.js のページ遷移の数え方、プライバシーポリシーの書き直し、本番で数字が出なかった理由を書く。
publishedAt: 2026-11-02T21:00:00+09:00
tags: [frontend, security, portfolio]
---

# はじめに

ブログを GitHub Pages に[切り離した](/posts/blog-split-to-github-pages/)とき、いいねとアクセス数の機能はまとめて捨てた。ブログから portfolio の API を呼ぶと単独で動かなくなるので、静的サイトの身軽さを取った形になっている。

ただ、記事が 30 本を超えると、どれが読まれているのかはやはり気になる。自前の API とテーブルはもう持ちたくないので、外のアクセス解析を入れることにした。入れたのはブログと portfolio の両方で、portfolio の中の作品ページ、ゲーム、座席表も含めている。

作業は Claude Code と進めた。ツールの比較とコードは一緒に詰めて、どれを入れるか、何を集めないかはこっちで決めている。

# Search Console では足りない

最初に考えたのは Google Search Console だった。ページに確認用の meta タグを 1 つ埋めるだけで、閲覧者の情報も集めない。

ただ、Search Console が数えるのは検索結果からのクリックだけになる。SNS のリンクや、ブックマークから来た分は出てこない。全体の数字がほしいなら、アクセス解析を別に入れるしかないんだよな。

候補にしたのは、無料で Cookie を使わない 2 つ。

| | GoatCounter | Cloudflare Web Analytics |
|---|---|---|
| スクリプトの置き場所 | 自分のサイトから配れる（ISC License） | Cloudflare から読み込む |
| CSP で足すもの | `connect-src` に送信先を 1 つ | `script-src` と `connect-src` の両方 |
| 料金 | 個人の非商用なら無料 | 無料 |

決め手は CSP だった。どちらのサイトも `script-src 'self'` で、外のスクリプトを読まない作りにしてある。GoatCounter ならスクリプトを自前で配れるので、ここを崩さずに済む。

# アカウントとサイトを作る

登録の画面は、アカウント名、サイトのドメイン、メールアドレス、パスワードだけ。アカウント名が、そのまま集計の画面の URL（`https://<名前>.goatcounter.com`）になる。

![GoatCounter の登録画面。Account name、Site domain、Email address、Password と、人間かどうかを確かめる数字の欄、Sign up のボタンが並んでいる](/images/goatcounter-access-analytics/signup.png)

登録の後で、Settings → Sites からサイトを 1 つ足した。portfolio とブログはどちらにも `/` があるので、1 つのサイトで数えると混ざる。サイトはアカウントの下にいくつでも作れて、ログインは共通、集計は別々になる。

![GoatCounter の Settings → Sites の画面。Code の表に elys（current）と elys-blog の 2 行があり、その下に新しいコードの入力欄と Add new のボタンがある](/images/goatcounter-access-analytics/sites.png)

新しいサイトは、作った時点の設定を写して始まる。なので、集める項目は先に決めておいたほうが楽かな。

# 集める項目を絞る

Settings の Data collection で、集める項目を 1 つずつ切れる。切った項目は後から取り戻せない、と画面にも書いてある。

![GoatCounter の Data collection の設定。Individual pageviews はオフ、Sessions・Referrer・User-Agent・Size・Country はオン、Region と Language はオフ。Region の下の対象国の欄には US, RU, CN と入っている](/images/goatcounter-access-analytics/data-collection.png)

決めたのは次の 3 つ。

- Individual pageviews（1 回ごとの閲覧の記録）はオフ。初期値もオフで、集計だけ残る
- Region（州や地方）はオフ。初期値はオンだが、対象国の欄が US, RU, CN になっているので、日本からの閲覧ではもともと取られない。プライバシーポリシーには「国まで」と書くので、切って揃えた
- Language もオフ。これは初期値のまま

GoatCounter は IP アドレスと User-Agent を保存しない。同じ人の閲覧かどうかを見分けるために、サイト・IP・User-Agent の組をメモリに最長 8 時間置くだけ、とされる。残るのは日ごと・時間ごとの集計になる。

# count.js を自分のサイトから配る

集計の画面には、こういう埋め込み方が出ている。

![GoatCounter の「No data received」の案内。埋め込む script のタグ（data-goatcounter に送信先、src に gc.zgo.at の count.js）と、ページビューが出ないときは広告ブロッカーを確かめるようにという注意が書いてある](/images/goatcounter-access-analytics/no-data.png)

このまま貼ると `gc.zgo.at` からスクリプトを読むことになる。そこで、`count.js` を自分のサイトに写して配ることにした。

写すときに気をつけたのは 2 つ。

- 版を固定する。CDN の `count.js` は開発中の最新で、`count.v4.js` は古い系統だった。リリースの v2.7.0 のタグにある `public/count.js` を使い、ファイル名にも版を入れている
- ライセンスを付ける。GoatCounter の本体は EUPL だが、`count.js` だけは ISC License になっている。先頭に出典と ISC の全文を書き、その下は手を加えずに置いた

CSP で足すのは送信先だけで済んだ。

```text
connect-src 'self' https://<コード>.goatcounter.com
```

`count.js` は `navigator.sendBeacon` で送るので、`connect-src` で許せば届く。

# 静的なブログはタグ 1 つ

ブログは TypeScript のビルドスクリプトで HTML を書き出しているので、全ページの本文の最後にタグを足すだけだった。

```html
<script data-goatcounter="https://<コード>.goatcounter.com/count"
        src="/assets/goatcounter.js?v=..." async></script>
```

開いたときに `count.js` が自分で 1 回数えてくれる。`localhost` で開いたときは数えないので、手元のプレビューで数字が増えることもない。

# Next.js はページ遷移を数える

portfolio は Next.js の静的 export で、サイトの中の移動は JS で画面を差し替えている。`count.js` が数えるのは読み込んだときの 1 回だけなので、そのままだと最初のページしか数えない。

そこで、`count.js` の自動の計測を `no_onload` で止めて、パスが変わるたびに count を呼ぶ部品を layout に置いた。

```tsx
const visit = createPageCounter(() => window.goatcounter?.count);

export function GoatCounter() {
  const pathname = usePathname();
  useEffect(() => { visit(pathname); }, [pathname]);

  return (
    <Script src="/goatcounter/count-2.7.0.js" strategy="afterInteractive"
      data-goatcounter={GOATCOUNTER_ENDPOINT}
      data-goatcounter-settings={JSON.stringify({ no_onload: true })}
      onLoad={() => visit()} />
  );
}
```

`createPageCounter` で気にしたのは 3 つ。

- 同じパスは続けて数えない。React の effect と `count.js` の読み込みの完了は、どちらが先に来るか決まってない
- `count.js` がまだ読み込まれていなければ待ち、読み込みが終わったときに今のページを数える
- 2 回目からは参照元を空にする。`document.referrer` は最初にサイトへ来たときの値のままなので、そのまま送るとサイト内の移動が全部外から来たことになる

3 つ目は、作ってから気づくとかなり面倒なやつだね。

座席表のページだけは Next.js の layout を通らない、独立した HTML になっている。こっちにはタグを直接入れた。共有用の URL が席の番号をクエリに持つので、`data-goatcounter-settings` でパスを 1 つに固定して、席ごとに別のページとして数えないようにしてある。

# プライバシーポリシーを書き直す

portfolio の /privacy/ には「アクセス解析ツールは使わない」とはっきり書いてあった。ブログにはそもそもプライバシーポリシーのページが無い。なので、portfolio は書き直して、ブログには新しく置いた。

![ブログのプライバシーポリシーのページ。GoatCounter に送るもの（パスとクエリ、タイトル、参照元、画面の幅、自動操作の判定）、GoatCounter が保存するもの、Cookie とブラウザに保存するもの、変更の節が並んでいる](/images/goatcounter-access-analytics/blog-privacy.png)

書いたのは、送るもの、GoatCounter が保存するもの、データの置き場所（フィンランドとドイツ）、Cookie を使わないこと。`count.js` が送る項目はコードの `get_data` を読んで並べ、保存の扱いは GoatCounter のプライバシーポリシーで確かめている。

1 つだけ、Cookie や localStorage を使わないと書いてきた portfolio とぶつかる所があった。`count.js` は、作者が自分の閲覧を数えないための設定として、localStorage の `skipgc` を読む。書き込むのは URL に `#toggle-goatcounter` を付けて開いたときだけ。それでも使っているのは確かなので、例外として文面に足している。

portfolio には、frontend のソース全体から保存領域の API を探すテストがある。`count.js` はそこから外して、別のテストで 2 つを確かめるようにした。中身が v2.7.0 のままであること（ハッシュで比べる）と、localStorage に触るのが `skipgc` だけであること。版を上げたときに、黙って中身が変わるのを止めるためだよ。

# 本番で数字が出ない

デプロイの後、ブラウザで両方のサイトを開いてみた。送信は出ているのに、集計の画面は「No data received」のまま変わらない。

切り分けとして、curl から GoatCounter に直接 1 件送ってみた。こっちは 1〜2 分で集計に出た。サーバー側は正常で、止めているのは手元の Firefox の側ということになる。広告ブロック系の拡張か、トラッキング防止の設定だと思う。案内の画面にも、ページビューが出ないときは広告ブロッカーを確かめるように書いてある。

手元のブラウザで開いても数字は増えない、というのは最初は焦った。ただ、自分の閲覧を数えなくて済むので、結果的には都合がいいのかもしれない。数えられないのはブロッカーを入れている人の分で、その分は少なめに出る数字として見ることにした。

テストで送った 1 件は、Settings → Manage pageviews でパスを指定して消してある。

# おわりに

一度捨てた機能を、今度は外のサービスで取り直した形になった。自前の API もテーブルも持たないので、ブログの単独運用とも両立している。CSP は `connect-src` に 1 つ足しただけで済んだし、思っていたより素直に入った感じある。

あとは数字が溜まるのを待つだけか。
