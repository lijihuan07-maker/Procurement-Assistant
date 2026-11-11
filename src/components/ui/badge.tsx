import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px text-xs font-medium", {
  variants: {
    variant: {
      default: "border-transparent bg-secondary text-secondary-foreground",
      ink: "border-transparent bg-primary text-primary-foreground",
      outline: "border-border text-muted-foreground",
      good: "border-transparent bg-good-soft text-good",
      warn: "border-transparent bg-warn-soft text-warn",
      bad: "border-transparent bg-bad-soft text-bad",
      info: "border-transparent bg-info-soft text-info",
      signal: "border-transparent bg-signal-soft text-[#7a5200]",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
