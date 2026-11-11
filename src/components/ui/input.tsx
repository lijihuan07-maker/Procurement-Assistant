import * as React from "react";
import { cn } from "@/lib/utils";

const base = "w-full min-w-0 rounded-md border border-input bg-card px-3 text-[13px] text-foreground placeholder:text-muted-foreground/70 transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, "h-9", className)} {...props} />;
}
export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, "min-h-20 py-2 leading-relaxed", className)} {...props} />;
}
export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(base, "h-9 cursor-pointer appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%235e6878%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[position:right_10px_center] bg-no-repeat pe-8 rtl:bg-[position:left_10px_center]", className)} {...props} />;
}
/** Label + control stacked; put the control inside as children. */
export function Field({ label, hint, className, children }: { label: React.ReactNode; hint?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("grid gap-1.5 text-xs font-medium text-muted-foreground", className)}>
      <span>{label}{hint && <span className="ms-1 font-normal text-muted-foreground/80">{hint}</span>}</span>
      {children}
    </label>
  );
}
