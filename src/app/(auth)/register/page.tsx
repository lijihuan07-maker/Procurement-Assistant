import AuthForm from "../AuthForm";
import { serverT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await serverT();
  return { title: `${t("注册")} · ${t("询价比价助手")}` };
}
export default function Page() { return <AuthForm mode="register" />; }
