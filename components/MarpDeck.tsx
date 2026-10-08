"use client";

import { useEffect, useRef } from "react";
import type { MarpDeck as MarpDeckData } from "@/lib/marp";
import styles from "./MarpDeck.module.css";

/**
 * Marp のスライドを表示する。HTML と CSS はビルド時に lib/marp.ts が作ったもの。
 * marp-core の browser helper は、スライドの中の文字の自動縮小などを DOM に当てるので、
 * 描画した要素だけを対象にして呼び、アンマウント時に外す。
 * helper は読み込んだ時点で HTMLElement（custom elements）を参照するので、
 * ビルド時の事前描画では読み込まず、ブラウザで effect が動いてから import する。
 */
export function MarpDeck({ html, css }: MarpDeckData) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    let cleanup: (() => void) | undefined;
    let unmounted = false;
    void import("@marp-team/marp-core/browser").then(({ browser }) => {
      if (unmounted) return;
      cleanup = browser(target).cleanup;
    });
    return () => {
      unmounted = true;
      cleanup?.();
    };
  }, [html]);

  return (
    <div className={styles.deck}>
      {/* テーマの CSS は div.marpit の下にスコープされている */}
      <style>{css}</style>
      <div
        ref={ref}
        // lib/marp.ts が html: false（生の HTML はすべてエスケープ）で変換した HTML
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
