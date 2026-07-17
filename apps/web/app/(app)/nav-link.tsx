"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/components/ui";

export function NavLink({ href, children, compact }: { href: string; children: ReactNode; compact?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block rounded-md text-sm transition-colors",
        compact ? "px-2.5 py-1 whitespace-nowrap" : "px-2.5 py-1.5",
        active ? "bg-accent-soft font-medium text-accent" : "text-foreground hover:bg-background",
      )}
    >
      {children}
    </Link>
  );
}
