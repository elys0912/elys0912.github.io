import type { ReactNode } from "react";
import styles from "./SiteFooter.module.css";

/** フッター。中の文言（著作権の表示、リンク）はサイトごとに違うので、children で受け取る */
export function SiteFooter({ children }: { children: ReactNode }) {
  return (
    <footer className={styles.footer}>
      <p className={styles.inner}>{children}</p>
    </footer>
  );
}
