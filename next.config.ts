import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // GitHub Pages で配信する静的サイトとして out/ に出力する。
  // ユーザーサイト（ドメインの直下で配信する）なので basePath は付けない
  output: "export",
  // `/posts/<slug>/` を `/posts/<slug>/index.html` として出力する
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
