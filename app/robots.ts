import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// 静的出力では force-static が必須（無いとビルドが失敗する）
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: new URL("sitemap.xml", SITE_URL).toString(),
  };
}
