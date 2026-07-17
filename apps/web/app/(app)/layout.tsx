import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { can, type Action } from "@ok/domain";
import { Badge } from "@/components/ui";
import { destroySession, requireSession } from "@/lib/auth";
import { t, type UiKey } from "@/lib/i18n";
import { NavLink } from "./nav-link";

async function signOut() {
  "use server";
  await destroySession();
  redirect("/login");
}

const NAV: { href: string; key: UiKey; requires?: Action }[] = [
  { href: "/home", key: "nav_home" },
  { href: "/panel", key: "nav_panel", requires: "panel.view" },
  { href: "/studies", key: "nav_studies", requires: "studies.view" },
  { href: "/distributions", key: "nav_distributions", requires: "distributions.view" },
  { href: "/responses", key: "nav_responses", requires: "responses.view" },
  { href: "/followup", key: "nav_followup", requires: "followup.view" },
  { href: "/analytics", key: "nav_analytics", requires: "analytics.view" },
  { href: "/insights", key: "nav_insights", requires: "insights.view" },
  { href: "/admin", key: "nav_admin", requires: "members.invite" },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const items = NAV.filter((n) => !n.requires || can(session.role, n.requires));

  return (
    <div className="flex min-h-screen">
      <nav aria-label="Primary" className="hidden w-52 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="px-4 py-4 text-base font-semibold tracking-tight">
          OK <span className="text-accent">· CX</span>
        </div>
        <ul className="flex-1 space-y-0.5 px-2">
          {items.map((item) => (
            <li key={item.href}>
              <NavLink href={item.href}>{t(session.locale, item.key)}</NavLink>
            </li>
          ))}
        </ul>
        <div className="border-t border-line px-4 py-3 text-xs">
          <div className="font-medium">{session.fullName}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-muted">
            <span className="truncate">{session.orgName}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <Badge tone="accent">{session.role.replace("_", " ")}</Badge>
            <form action={signOut}>
              <button type="submit" className="text-muted underline-offset-2 hover:underline cursor-pointer">
                {t(session.locale, "sign_out")}
              </button>
            </form>
          </div>
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-topbar flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2 md:hidden">
          <span className="font-semibold">OK · CX</span>
          <form action={signOut}>
            <button type="submit" className="text-xs text-muted underline">
              {t(session.locale, "sign_out")}
            </button>
          </form>
        </header>
        {/* Mobile nav */}
        <nav aria-label="Primary mobile" className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-2 py-1.5 md:hidden">
          {items.map((item) => (
            <NavLink key={item.href} href={item.href} compact>
              {t(session.locale, item.key)}
            </NavLink>
          ))}
        </nav>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
