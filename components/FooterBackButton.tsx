"use client";

// TODO: portfolio の独自ドメインができたら、lib/site.ts の FOOTER_LINKS に portfolio へのリンクを足し、
// このボタン（app/layout.tsx での呼び出しと HISTORY_BACK_LABEL も）を消す。
// portfolio の今の URL はこのサイトに載せないので、それまでの仮の導線にする（portfolio から来た人は履歴で戻れる）。

import { useSyncExternalStore } from "react";
import styles from "./FooterBackButton.module.css";

// 履歴の数は、ページを読み込んだ時点の値で決める（あとから変わっても追わない）
function subscribe(): () => void {
  return () => {};
}

/**
 * フッターの「前のページへ戻る」。ブラウザの履歴を 1 つ戻る。
 * 前のページが無い（直接開いた、新しいタブで開いた）ときは、区切りごと出さない。
 * 履歴はブラウザでしか分からないので、静的に書き出した HTML には出さず、読み込んだあとに出す。
 */
export function FooterBackButton({ label }: { label: string }) {
  const canGoBack = useSyncExternalStore(subscribe, () => window.history.length > 1, () => false);
  if (!canGoBack) return null;
  return (
    <span>
      {" ・ "}
      <button type="button" className={styles.button} onClick={() => window.history.back()}>
        {label}
      </button>
    </span>
  );
}
