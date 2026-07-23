import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { STUDY_STATUS, STUDY_STATUS_TONE, label } from "@/lib/labels";
import { StudyTabs } from "./study-tabs";

/** Fælles studiehoved med titel, status og faner (Byg · Udsend · Resultater). */
export default async function StudyLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const data = await withUser(session.userId, session.orgId, async (tx) => {
    const [study] = await tx`
      select s.id, s.title, s.status, w.name as workspace, u.full_name as owner
      from studies s
      join workspaces w on w.id = s.workspace_id
      join users u on u.id = s.owner_id
      where s.id = ${id}`;
    if (!study) return null;
    const [counts] = await tx`
      select count(*) filter (where status = 'completed') as completed
      from responses where study_id = ${id}`;
    return { study, completed: Number(counts.completed) };
  });
  if (!data) notFound();
  const { study } = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/studies" className="text-xs text-muted hover:text-accent hover:underline">
            ← Studier
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2.5 font-display text-2xl tracking-tight text-heading">
            <span className="truncate">{study.title}</span>
            <StatusBadge tone={STUDY_STATUS_TONE[study.status] ?? "gray"}>
              {label(STUDY_STATUS, study.status)}
            </StatusBadge>
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {study.workspace} · ejer {study.owner}
          </p>
        </div>
        <StudyTabs studyId={id} resultCount={data.completed} />
      </div>
      {children}
    </div>
  );
}
