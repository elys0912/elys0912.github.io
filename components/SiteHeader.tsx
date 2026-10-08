import { NavLinks, type NavItem } from "./NavLinks";
import styles from "./SiteHeader.module.css";

/**
 * ヘッダー。文字のロゴやマークは置かず、3 つのアクセント色（--red、--yellow、--green）を背景として左に差し込む。
 * PC は斜めに並べて右と下へ黒に溶かし、スマホは上端の帯にする（CSS）。
 * ナビの項目はサイトごとに違うので、navItems で受け取る。
 */
export function SiteHeader({ navItems }: { navItems: readonly NavItem[] }) {
  return (
    <header className={styles.header}>
      <div className={styles.band} aria-hidden="true" />
      <div className={styles.inner}>
        <nav aria-label="メインメニュー">
          <NavLinks items={navItems} className={styles.nav} />
        </nav>
      </div>
    </header>
  );
}
