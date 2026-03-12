import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import SidebarLayout from "@/components/SidebarLayout";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"] });
export const metadata: Metadata = {
  title: "Anime Track",
  description: "专注于番剧记录、进度管理和观看历史的动漫追番工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        <Providers>
          <SidebarLayout>
            {children}
          </SidebarLayout>
        </Providers>
      </body>
    </html>
  );
}

