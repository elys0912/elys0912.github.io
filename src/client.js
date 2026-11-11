// ブラウザで動かすスクリプト（ビルドが out/assets/site.js にコピーし、全ページで読む）。依存なし。
// 記事の目次の現在地（aria-current="location"）：スクロールのたびに、画面の上から 30% の線より上にある最後の見出しにする。
// ページの末尾まで来たら最後の見出しにする（短い記事では、後ろの見出しが線まで上がらないまま末尾に着くため）。
// 目次のリンクをクリックしたときは、次に利用者がスクロールするまで、クリックした見出しにする。
// 記事の本文には、見出し（h2）のリンクと、コードブロックのコピーボタンを足す。
// class 名は、src/css.ts が書き換えた後の名前（ファイル名_class）をそのまま書く
// @ts-check

// 見出しのリンク。見出しの URL（#section-1 など）をコピーしやすくする。id が付くのは本文の h2 だけ
(() => {
  for (const heading of document.querySelectorAll(".PostDetail_body h2[id]")) {
    const anchor = document.createElement("a");
    anchor.className = "PostExtras_anchor";
    anchor.href = `#${heading.id}`;
    anchor.textContent = "#";
    anchor.setAttribute("aria-label", `「${heading.textContent}」へのリンク`);
    heading.append(anchor);
  }
})();

// コードブロックのコピーボタン。https でないページ（手元の http のプレビューなど）では clipboard が無いので足さない
(() => {
  if (navigator.clipboard === undefined) return;

  const COPY_LABEL = "コピー";
  const COPIED_LABEL = "コピーした";
  // コピーした後、ボタンの文字を元に戻すまでの時間
  const COPIED_LABEL_MS = 2000;

  for (const pre of document.querySelectorAll(".PostDetail_body pre")) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "PostExtras_copy";
    button.textContent = COPY_LABEL;
    button.addEventListener("click", async () => {
      // コードブロックの文字は改行で終わる。貼り付けた先に空の行が増えないよう、最後の改行を落とす
      await navigator.clipboard.writeText((pre.textContent ?? "").replace(/
$/, ""));
      button.textContent = COPIED_LABEL;
      window.setTimeout(() => {
        button.textContent = COPY_LABEL;
      }, COPIED_LABEL_MS);
    });

    // ボタンを pre の外に置くため、pre を箱で包む
    const codeBlock = document.createElement("div");
    codeBlock.className = "PostExtras_codeBlock";
    pre.replaceWith(codeBlock);
    codeBlock.append(pre, button);
  }
})();

(() => {
  // 目次の現在地。scroll のたびに見出しの位置から決める。
  // IntersectionObserver（画面の上から 30% の帯に入った見出しにする）は使わない。帯への出入りしか知らせないため。
  // 帯に見出しが無い位置（一度に飛んだ先、上へ戻った先）で前の現在地が残り、短い記事では後ろの見出しが帯に入らない
  const tocLinks = [...document.querySelectorAll('nav[aria-labelledby="toc-heading"] a[href^="#"]')];
  const sections = tocLinks.flatMap((link) => {
    const heading = document.getElementById(decodeURIComponent(link.getAttribute("href")?.slice(1) ?? ""));
    return heading === null ? [] : [{ link, heading }];
  });
  if (sections.length === 0) return;

  // 見出しがこの線（画面の上から 30%）より上に来たら、その見出しの節を読んでいるとみなす
  const CURRENT_LINE_RATIO = 0.3;
  const sectionAtScrollPosition = () => {
    const currentLineY = window.innerHeight * CURRENT_LINE_RATIO;
    // scrollY が小数になる拡大率でも末尾と判定するため、切り上げて比べる
    const isScrolledToBottom =
      window.scrollY > 0 && Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight;
    const passedSections = sections.filter(({ heading }) => heading.getBoundingClientRect().top <= currentLineY);

    return isScrolledToBottom ? sections[sections.length - 1] : (passedSections.at(-1) ?? sections[0]);
  };

  // 目次のリンクで移った節。末尾近くの見出しは線まで上がらず、末尾では最後の見出しになるため、クリックした節を優先する。
  // 次に利用者がスクロールしたら undefined に戻し、スクロール位置からの判定に戻す
  /** @type {(typeof sections)[number] | undefined} */
  let clickedSection;
  // 目次のクリックの後に、利用者がスクロールの操作（ホイール、タッチ、キー、スクロールバーのドラッグ）をしたか。
  // リンクで移るときのスクロール（smooth scroll を含む）は scroll を何度も起こすため、scroll だけでは利用者の操作と区別できない
  let hasUserScrollInput = false;

  const markCurrentSection = () => {
    const current = clickedSection ?? sectionAtScrollPosition();
    for (const { link } of sections) {
      if (link === current.link) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  };

  // scroll は 1 フレームに何度も来るため、判定は次の描画の前に 1 回だけにする
  let isMarkScheduled = false;
  const scheduleMarkCurrentSection = () => {
    if (isMarkScheduled) return;

    isMarkScheduled = true;
    window.requestAnimationFrame(() => {
      isMarkScheduled = false;
      markCurrentSection();
    });
  };

  for (const section of sections) {
    section.link.addEventListener("click", (event) => {
      if (!(event instanceof MouseEvent)) return;

      // 修飾キー付きと左以外のボタンは新しいタブなどで開き、このページの中を移らない
      const isNewTabClick = event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
      if (event.defaultPrevented || isNewTabClick) return;

      clickedSection = section;
      // クリックの前の pointerdown・keydown（Enter）はスクロールの操作として数えない
      hasUserScrollInput = false;
      markCurrentSection();
    });
  }

  // scroll より先に来る、利用者の操作。pointerdown はスクロールバーのドラッグとクリックを含む
  for (const type of ["wheel", "touchstart", "keydown", "pointerdown"]) {
    window.addEventListener(
      type,
      () => {
        hasUserScrollInput = true;
      },
      { passive: true, capture: true },
    );
  }

  window.addEventListener(
    "scroll",
    () => {
      if (hasUserScrollInput) clickedSection = undefined;
      scheduleMarkCurrentSection();
    },
    { passive: true },
  );
  window.addEventListener("resize", scheduleMarkCurrentSection);
  markCurrentSection();
})();
