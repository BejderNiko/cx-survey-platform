"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/components/ui";

export function NavLink({ href, children, icon, compact }: {
  href: string; children: ReactNode; icon?: ReactNode; compact?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg text-sm transition-colors duration-100",
        compact ? "px-2.5 py-1 whitespace-nowrap" : "px-3 py-2",
        active
          ? "bg-accent-soft font-medium text-accent"
          : "text-foreground/80 hover:bg-accent-soft/50 hover:text-foreground",
      )}
    >
      {icon && <span className={cn("shrink-0", active ? "text-accent" : "text-muted")}>{icon}</span>}
      {children}
    </Link>
  );
}
