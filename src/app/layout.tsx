import type { Metadata } from "next";
import "./globals.css";
import { ToastHost } from "@/components/ui";

export const metadata: Metadata = { title: "询价比价助手", description: "从需求清单到比价表的 AI 采购工具" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <ToastHost />
      </body>
    </html>
  );
}
