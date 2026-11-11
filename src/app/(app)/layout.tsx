import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/auth";
import { NavLinks, Logout } from "./Nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  return (
    <>
      <header className="topbar">
        <div className="in">
          <Link href="/projects" className="brand"><i />询价比价助手</Link>
          <NavLinks />
          <div className="who"><span>{user.companyName} · {user.name || user.email}</span><Logout /></div>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
