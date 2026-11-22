"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronDown, FileSignature, FolderKanban, LayoutDashboard, LogOut, Menu, Plus, Settings2, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/Brand";
import { LangSwitch } from "@/components/LangSwitch";

const LINKS = [
  { href: "/workbench", label: "工作台", icon: LayoutDashboard },
  { href: "/projects", label: "项目", icon: FolderKanban, also: "/packages" },
  { href: "/contracts", label: "合同台账", icon: FileSignature },
  { href: "/suppliers", label: "供应商库", icon: Building2 },
  { href: "/settings", label: "系统设置", icon: Settings2 },
];

/** Tell the sidebar which engineering project is open (from requirement and package pages), or that the list changed. */
export function announceSite(siteId: string | null) { window.dispatchEvent(new CustomEvent("pa:site", { detail: siteId })); }
export function sitesChanged() { window.dispatchEvent(new Event("pa:sites")); }

type SiteLink = { id: string; name: string };

export function Shell({ user, children }: { user: { name: string; email: string; company: string }; children: React.ReactNode }) {
  const T = useT();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState<SiteLink[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const inProjects = /^\/(projects|sites|packages)/.test(path);
  const [expanded, setExpanded] = useState(inProjects);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => { if (inProjects) setExpanded(true); if (!/^\/(projects\/|packages\/)/.test(path)) setActive(null); }, [path, inProjects]);
  useEffect(() => {
    const load = () => api<{ sites: SiteLink[] }>("/api/sites").then((d) => setSites(d.sites)).catch(() => {});
    const onSite = (e: Event) => setActive((e as CustomEvent<string | null>).detail);
    load();
    window.addEventListener("pa:sites", load); window.addEventListener("pa:site", onSite);
    return () => { window.removeEventListener("pa:sites", load); window.removeEventListener("pa:site", onSite); };
  }, []);
  const siteOn = (id: string) => path === `/sites/${id}` || active === id;
  const nav = (
    <div className="flex h-full flex-col overflow-hidden">
      <Link href="/workbench" className="flex items-center gap-2.5 px-5 pt-5 pb-6 text-[15px] font-semibold text-white no-underline">
        <BrandMark className="size-7" />{T("询价比价助手")}
      </Link>
      <nav className="grid gap-0.5 overflow-y-auto px-3">
        {LINKS.map(({ href, label, icon: Icon, also }) => {
          const on = href === "/projects" ? path === "/projects" : path.startsWith(href) || (also && path.startsWith(also));
          const link = (
            <Link key={href} href={href} className={cn("relative flex flex-1 items-center gap-2.5 rounded-md px-3 py-2 text-[13.5px] no-underline transition-colors", on ? "bg-sidebar-active font-medium text-white" : "text-sidebar-foreground hover:bg-white/5 hover:text-white")}>
              {on && <span className="absolute top-2 bottom-2 -start-3 w-[3px] rounded-e bg-signal" />}
              <Icon className="size-4" />{T(label)}
            </Link>
          );
          if (href !== "/projects") return link;
          return (
            <div key={href}>
              <div className="flex items-center">
                {link}
                <button aria-label={T(expanded ? "收起工程项目" : "展开工程项目")} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}
                  className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-sidebar-foreground hover:bg-white/5 hover:text-white">
                  <ChevronDown className={cn("size-4 transition-transform", !expanded && "-rotate-90 rtl:rotate-90")} />
                </button>
              </div>
              {expanded && (
                <div className="mt-0.5 mb-1 grid gap-px border-s border-white/10 ms-5 ps-2">
                  {sites.map((x) => (
                    <Link key={x.id} href={`/sites/${x.id}`} title={x.name}
                      className={cn("truncate rounded-md px-2.5 py-1.5 text-[13px] no-underline", siteOn(x.id) ? "bg-sidebar-active font-medium text-white" : "text-sidebar-foreground hover:bg-white/5 hover:text-white")}>{x.name}</Link>
                  ))}
                  <Link href="/projects?new=1" className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] text-sidebar-foreground/80 no-underline hover:bg-white/5 hover:text-white"><Plus className="size-3.5" />{T("新建工程项目")}</Link>
                </div>
              )}
            </div>
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
        <Link href="/workbench" className="flex items-center gap-2 text-[15px] font-semibold text-white no-underline"><BrandMark className="size-6" />{T("询价比价助手")}</Link>
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
