import { cn } from "@/lib/utils";

export function NotionDivider({ className }: { className?: string }) {
  return <div className={cn("notion-divider-line", className)} />;
}
