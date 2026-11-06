import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 はネイティブモジュールのためバンドルしない
  serverExternalPackages: ["better-sqlite3", "kuromoji"],
  poweredByHeader: false,
};

export default nextConfig;
