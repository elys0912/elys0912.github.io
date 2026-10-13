// ブラウザで動かすスクリプト（ビルドが out/assets/site.js にコピーし、全ページで読む）。依存なし。
// 1. フッターの「前のページへ戻る」：履歴があるときだけ出す（直接開いたとき、新しいタブで開いたときは出さない）。
//    portfolio へ戻る仮の導線。TODO: portfolio の独自ドメインができたら、src/site.ts の FOOTER_LINKS にリンクを足してこれを消す
// 2. 記事の目次の現在地（aria-current="location"）：スクロールのたびに、画面の上から 30% の線より上にある最後の見出しにする。
//    ページの末尾まで来たら最後の見出しにする（短い記事では、後ろの見出しが線まで上がらないまま末尾に着くため）
// @ts-check

(() => {
  const footer = document.querySelector("p[data-back-label]");
  if (footer instanceof HTMLElement && window.history.length > 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = footer.dataset.backClass ?? "";
    button.textContent = footer.dataset.backLabel ?? "";
    button.addEventListener("click", () => window.history.back());
    const span = document.createElement("span");
    span.append(" ・ ", button);
    footer.append(span);
  }

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
  const markCurrentSection = () => {
    const currentLineY = window.innerHeight * CURRENT_LINE_RATIO;
    // scrollY が小数になる拡大率でも末尾と判定するため、切り上げて比べる
    const isScrolledToBottom =
      window.scrollY > 0 && Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight;
    const passedSections = sections.filter(({ heading }) => heading.getBoundingClientRect().top <= currentLineY);
    const current = isScrolledToBottom ? sections[sections.length - 1] : (passedSections.at(-1) ?? sections[0]);

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
  window.addEventListener("scroll", scheduleMarkCurrentSection, { passive: true });
  window.addEventListener("resize", scheduleMarkCurrentSection);
  markCurrentSection();
})();
