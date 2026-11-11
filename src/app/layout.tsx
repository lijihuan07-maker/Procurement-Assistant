import type { Metadata } from "next";
import "./globals.css";
import { ToastHost } from "@/components/app";
import { I18nProvider } from "@/lib/i18n/client";
import { getLang } from "@/lib/i18n/server";
import { translate, langInfo } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return { title: translate(lang, "询价比价助手"), description: translate(lang, "从需求清单到比价表的 AI 采购工具") };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={langInfo(lang).html} dir={langInfo(lang).dir}>
      <body>
        <I18nProvider lang={lang}>
          {children}
          <ToastHost />
        </I18nProvider>
      </body>
    </html>
  );
}
