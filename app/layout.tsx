import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ApiSettingsProvider } from "@/components/ApiSettingsProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BL 短剧编剧室",
  description: "海外女性向 BL 商业短剧 Agent 对话界面",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="h-full bg-background text-foreground antialiased">
        <ApiSettingsProvider>{children}</ApiSettingsProvider>
      </body>
    </html>
  );
}
