"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

/** Fanenavigation i Lyssna-stil: Byg · Udsend · Resultater. */
export function StudyTabs({ studyId, resultCount }: { studyId: string; resultCount: number }) {
  const base = `/studies/${studyId}`;
  const pathname = usePathname();

  const tabs = [
    {
      href: base,
      label: "Byg",
      active: pathname === base || pathname.startsWith(`${base}/builder`),
    },
    {
      href: `${base}/udsend`,
      label: "Udsend",
      active: pathname.startsWith(`${base}/udsend`),
    },
    {
      href: `${base}/results`,
      label: "Resultater",
      count: resultCount,
      active: pathname.startsWith(`${base}/results`),
    },
  ];

  return (
    <nav aria-label="Studie" className="inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-card">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-colors duration-100",
            tab.active
              ? "bg-accent-soft font-medium text-accent"
              : "text-muted hover:text-foreground",
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={cn(
                "rounded-full px-1.5 text-xs tabular-nums",
                tab.active ? "bg-accent text-white" : "bg-background text-muted",
              )}
            >
              {tab.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
