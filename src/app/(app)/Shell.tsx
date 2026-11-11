"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, FolderKanban, LogOut, Menu, Settings2, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/Brand";
import { LangSwitch } from "@/components/LangSwitch";

const LINKS = [
  { href: "/projects", label: "项目", icon: FolderKanban, also: "/packages" },
  { href: "/suppliers", label: "供应商库", icon: Building2 },
  { href: "/settings", label: "设置与模板", icon: Settings2 },
];

export function Shell({ user, children }: { user: { name: string; email: string; company: string }; children: React.ReactNode }) {
  const T = useT();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const nav = (
    <div className="flex h-full flex-col">
      <Link href="/projects" className="flex items-center gap-2.5 px-5 pt-5 pb-6 text-[15px] font-semibold text-white no-underline">
        <BrandMark className="size-7" />{T("询价比价助手")}
      </Link>
      <nav className="grid gap-0.5 px-3">
        {LINKS.map(({ href, label, icon: Icon, also }) => {
          const on = path.startsWith(href) || (also && path.startsWith(also));
          return (
            <Link key={href} href={href} className={cn("relative flex items-center gap-2.5 rounded-md px-3 py-2 text-[13.5px] no-underline transition-colors", on ? "bg-sidebar-active font-medium text-white" : "text-sidebar-foreground hover:bg-white/5 hover:text-white")}>
              {on && <span className="absolute top-2 bottom-2 -start-3 w-[3px] rounded-e bg-signal" />}
              <Icon className="size-4" />{T(label)}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto grid gap-1 border-t border-white/10 px-3 py-4">
        <LangSwitch className="text-sidebar-foreground hover:bg-white/5 hover:text-white" />
        <div className="px-2 pt-2">
          <div className="truncate text-[13px] font-medium text-white">{user.company}</div>
          <div className="truncate text-xs text-sidebar-foreground">{user.name}</div>
        </div>
        <button className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-start text-[13px] text-sidebar-foreground hover:bg-white/5 hover:text-white"
          onClick={async () => { await api("/api/auth/logout", { body: {} }); window.location.href = "/login"; }}>
          <LogOut className="size-4" />{T("退出")}
        </button>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen lg:ps-60">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-60 bg-sidebar lg:block">{nav}</aside>
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-sidebar px-4 lg:hidden">
        <button aria-label={T("菜单")} className="cursor-pointer text-white" onClick={() => setOpen(true)}><Menu className="size-5" /></button>
        <Link href="/projects" className="flex items-center gap-2 text-[15px] font-semibold text-white no-underline"><BrandMark className="size-6" />{T("询价比价助手")}</Link>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-64 bg-sidebar shadow-xl">
            <button aria-label={T("关闭菜单")} className="absolute top-5 end-4 cursor-pointer text-sidebar-foreground" onClick={() => setOpen(false)}><X className="size-5" /></button>
            {nav}
          </aside>
        </div>
      )}
      <main className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
