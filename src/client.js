// ブラウザで動かすスクリプト（ビルドが out/assets/site.js にコピーし、全ページで読む）。依存なし。
// 1. フッターの「前のページへ戻る」：履歴があるときだけ出す（直接開いたとき、新しいタブで開いたときは出さない）。
//    portfolio へ戻る仮の導線。TODO: portfolio の独自ドメインができたら、src/site.ts の FOOTER_LINKS にリンクを足してこれを消す
// 2. 記事の目次の現在地（aria-current="location"）：画面の上から 30% までの帯に入った見出しにする
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

  const links = [...document.querySelectorAll('nav[aria-labelledby="toc-heading"] a[href^="#"]')];
  const headings = links
    .map((link) => document.getElementById(decodeURIComponent(link.getAttribute("href")?.slice(1) ?? "")))
    .filter((element) => element !== null);
  if (headings.length === 0 || !("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting);
      if (visible.length === 0) return;
      const topmost = visible.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b));
      for (const link of links) {
        if (link.getAttribute("href") === `#${topmost.target.id}`) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
    },
    { rootMargin: "0px 0px -70% 0px" },
  );
  for (const heading of headings) observer.observe(heading);
})();
