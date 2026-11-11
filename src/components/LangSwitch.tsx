"use client";
import { Check, Languages } from "lucide-react";
import { LANGS } from "@/lib/i18n";
import { switchLang, useLang } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function LangSwitch({ className, align = "start" }: { className?: string; align?: "start" | "end" }) {
  const cur = useLang();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn("inline-flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none", className)} aria-label="Language">
        <Languages className="size-4" />{LANGS.find((l) => l.code === cur)?.label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {LANGS.map((l) => (
          <DropdownMenuItem key={l.code} onSelect={() => l.code !== cur && switchLang(l.code)}>
            <span className="flex-1">{l.label}</span>{l.code === cur && <Check />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
