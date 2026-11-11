"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/client/api";

const LINKS = [["/projects", "项目"], ["/suppliers", "供应商库"], ["/settings", "设置与模板"]] as const;

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="nav">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className={path.startsWith(href) || (href === "/projects" && path.startsWith("/packages")) ? "on" : ""}>{label}</Link>
      ))}
    </nav>
  );
}

export function Logout() {
  return <button className="link" onClick={async () => { await api("/api/auth/logout", { body: {} }); window.location.href = "/login"; }}>退出</button>;
}
