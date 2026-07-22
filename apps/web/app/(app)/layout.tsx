import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { can, type Action } from "@ok/domain";
import { IconBulb, IconChart, IconCog, IconHome, IconPanel, IconStudy } from "@/components/icons";
import { destroySession, requireSession } from "@/lib/auth";
import { t, type UiKey } from "@/lib/i18n";
import { ROLE_LABEL, label } from "@/lib/labels";
import { NavLink } from "./nav-link";

async function signOut() {
  "use server";
  await destroySession();
  redirect("/login");
}

const NAV: { href: string; key: UiKey; icon: ReactNode; requires?: Action }[] = [
  { href: "/home", key: "nav_home", icon: <IconHome /> },
  { href: "/studies", key: "nav_studies", icon: <IconStudy />, requires: "studies.view" },
  { href: "/panel", key: "nav_panel", icon: <IconPanel />, requires: "panel.view" },
  { href: "/analytics", key: "nav_analytics", icon: <IconChart />, requires: "analytics.view" },
  { href: "/insights", key: "nav_insights", icon: <IconBulb />, requires: "insights.view" },
  { href: "/admin", key: "nav_admin", icon: <IconCog />, requires: "members.invite" },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const items = NAV.filter((n) => !n.requires || can(session.role, n.requires));
  const initials = session.fullName
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen">
      <nav aria-label="Primær" className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="px-5 pb-4 pt-5">
          <div className="font-display text-xl tracking-tight text-heading">
            OK<span className="text-accent"> · CX</span>
          </div>
          <div className="mt-0.5 text-[11px] uppercase tracking-widest text-muted">Kundeindsigt</div>
        </div>
        <ul className="flex-1 space-y-0.5 px-3">
          {items.map((item) => (
            <li key={item.href}>
              <NavLink href={item.href} icon={item.icon}>
                {t(item.key)}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="border-t border-line px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
              {initials}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{session.fullName}</div>
              <div className="truncate text-xs text-muted">
                {label(ROLE_LABEL, session.role)} · {session.orgName}
              </div>
            </div>
          </div>
          <form action={signOut} className="mt-2.5">
            <button
              type="submit"
              className="text-xs text-muted underline-offset-2 hover:text-accent hover:underline cursor-pointer"
            >
              {t("sign_out")}
            </button>
          </form>
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-topbar flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2 md:hidden">
          <span className="font-display text-base text-heading">OK · CX</span>
          <form action={signOut}>
            <button type="submit" className="text-xs text-muted underline">
              {t("sign_out")}
            </button>
          </form>
        </header>
        {/* Mobilnavigation */}
        <nav aria-label="Primær mobil" className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-2 py-1.5 md:hidden">
          {items.map((item) => (
            <NavLink key={item.href} href={item.href} compact>
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
        <main className="min-w-0 flex-1 p-4 md:p-8">
          <div className="page-in mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
