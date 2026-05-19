import type { Metadata } from "next";
import { BRAND_NAME, BRAND_PAGE_DESCRIPTION, BRAND_PAGE_TITLE } from "@/lib/branding";
import { Geist, Geist_Mono } from "next/font/google";
import { ApiSettingsProvider } from "@/components/ApiSettingsProvider";
import { WorkspaceLocalMigration } from "@/components/WorkspaceLocalMigration";
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
  title: {
    default: BRAND_PAGE_TITLE,
    template: `%s · ${BRAND_NAME}`,
  },
  description: BRAND_PAGE_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="h-full bg-background text-foreground antialiased">
        <ApiSettingsProvider>
          <WorkspaceLocalMigration />
          {children}
        </ApiSettingsProvider>
      </body>
    </html>
  );
}
