import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { PwaRegister } from "@/components/ppe/PwaRegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#d97706",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "نظام كشف معدات السلامة | PPE Detector",
  description:
    "نظام ذكي لكشف التزام معدات السلامة الشخصية (خوذة / سديري) عبر 4 كلاسات، مع داتاسيت حقيقية وتجارب أداء وتحليل أخطاء وتقرير تقني — قابل للتثبيت على الجوال بدون متجر تطبيقات.",
  keywords: ["PPE", "Safety", "Helmet", "Vest", "كشف", "سلامة", "خوذة", "سديري"],
  applicationName: "كشف PPE",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "كشف PPE",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <PwaRegister />
      </body>
    </html>
  );
}
