import type { MetadataRoute } from "next";
import { listPublishedPosts } from "@/lib/posts";
import { SITE_URL } from "@/lib/site";
import { buildSitemap } from "@/lib/sitemap";

// 静的出力では force-static が必須（無いとビルドが失敗する）
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(listPublishedPosts(), SITE_URL);
}
