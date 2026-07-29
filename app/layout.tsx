import type { Metadata } from "next";
import { FooterBackButton } from "@/components/FooterBackButton";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { formatDate } from "@/lib/format";
import { buildPageMetadata } from "@/lib/metadata";
import {
  AUTHOR_NAME,
  FOOTER_LINKS,
  HISTORY_BACK_LABEL,
  NAV_ITEMS,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";
import "./globals.css";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  // メタデータを持たないページ（404 など）の既定値。canonical と og:url が 404 に継承されないよう、
  // layout では path を渡さない（各ページが pageMetadata で自分の URL を入れる）。OGP 画像とフィードの alternate は入れる
  ...buildPageMetadata({ description: SITE_DESCRIPTION }, SITE_URL),
  title: {
    template: `%s | ${SITE_NAME}`,
    default: SITE_NAME,
  },
};

/** 著作権の表示の年。ビルド環境（CI は UTC）に左右されないよう、日本時間で数える */
function copyrightYear(): string {
  return formatDate(new Date().toISOString()).slice(0, 4);
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body>
        <SiteHeader navItems={NAV_ITEMS} />
        <main className={styles.main}>{children}</main>
        <SiteFooter>
          © {copyrightYear()} {AUTHOR_NAME}
          {FOOTER_LINKS.map((link) => (
            <span key={link.href}>
              {" ・ "}
              <a href={link.href} rel="noopener noreferrer">
                {link.label}
              </a>
            </span>
          ))}
          {/* TODO: portfolio の独自ドメインができたら、FOOTER_LINKS に portfolio へのリンクを足してこれを外す */}
          <FooterBackButton label={HISTORY_BACK_LABEL} />
        </SiteFooter>
      </body>
    </html>
  );
}
