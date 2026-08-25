import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/Providers";
import "katex/dist/katex.min.css";
import "./globals.css";

const pingfang = localFont({
  src: [
    {
      path: "./fonts/pingfangsc-light.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "./fonts/pingfangsc-regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/pingfangsc-medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/pingfangsc-semibold.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-sans",
  display: "swap",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "八号产房 - AI 多模型对话助手",
  description: "支持 OpenAI、Anthropic、DeepSeek、通义千问、文心一言的多模型 AI 对话平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${pingfang.variable} ${geistMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
