"use client";

// 記事の目次。項目はビルド時に本文の h2 から作って受け取り、ここでは現在地の判定だけをする。
// 現在地は IntersectionObserver で、画面の上の方を通った最後の見出しにする。

import { useEffect, useState } from "react";
import type { Heading } from "@/lib/markdown";
import styles from "./TableOfContents.module.css";

export function TableOfContents({ headings }: { headings: Heading[] }) {
  // 読み始めは最初の見出しを現在地にしておく
  const [activeId, setActiveId] = useState<string | undefined>(headings[0]?.id);

  useEffect(() => {
    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) return;

    // 画面の上から 30% までの帯に入った見出しを現在地にする
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        const topmost = visible.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b,
        );
        setActiveId(topmost.target.id);
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [headings]);

  return (
    <nav className={styles.toc} aria-labelledby="toc-heading">
      <p id="toc-heading" className={styles.heading}>
        目次
      </p>
      <ol className={styles.list}>
        {headings.map((heading) => (
          <li key={heading.id}>
            <a href={`#${heading.id}`} aria-current={heading.id === activeId ? "location" : undefined}>
              {heading.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
