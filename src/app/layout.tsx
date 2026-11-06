import type { Metadata, Viewport } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Synclie - 座席・グループ抽選",
    template: "%s | Synclie - 座席・グループ抽選",
  },
  description: "講義ごとの座席・グループを QR コードから抽選する Synclie シリーズのアプリです。",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#161616",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <SiteHeader />
        {children}
        <footer className="site-footer no-print">KOBAE LAB · Synclie</footer>
      </body>
    </html>
  );
}
