import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface NotionDropdownProps {
  children: ReactNode;
  className?: string;
}

export function NotionDropdown({ children, className }: NotionDropdownProps) {
  return (
    <div className={cn("notion-menu animate-dropdown-in", className)}>
      {children}
    </div>
  );
}
