import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { Shell } from "./Shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  return <Shell user={{ name: user.name || user.email, email: user.email, company: user.companyName }}>{children}</Shell>;
}
