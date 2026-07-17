"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge, Button, Card, Input, Select, Textarea, cn } from "@/components/ui";
import { addCaseNote, createRule, toggleRule, updateCase } from "./actions";

const STATUS_TONE: Record<string, string> = {
  new: "red", assigned: "amber", in_progress: "blue", waiting: "gray",
  resolved: "green", dismissed: "gray",
};
const PRIORITY_TONE: Record<string, string> = {
  low: "gray", normal: "blue", high: "amber", critical: "red",
};
const STATUSES = ["new", "assigned", "in_progress", "waiting", "resolved", "dismissed"];

interface CaseRow {
  id: string;
  title: string;
  priority: string;
  status: string;
  study: string;
  assigneeId: string | null;
  assignee: string | null;
  nps: number | null;
  verbatim: string | null;
  due: string | null;
  overdue: boolean;
  resolution: string | null;
  created: string;
  activity: { type: string; detail: Record<string, unknown>; actor: string; at: string }[];
}

export function CaseBoard({
  cases, members, canManage, mineOnly, currentUserId,
}: {
  cases: CaseRow[];
  members: { id: string; name: string }[];
  canManage: boolean;
  mineOnly: boolean;
  currentUserId: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <Card
      title={`Cases (${cases.length})`}
      actions={
        <div className="flex gap-1 text-xs">
          <Link href="/followup" className={cn("rounded px-2 py-1", !mineOnly ? "bg-accent-soft text-accent font-medium" : "text-muted hover:text-foreground")}>
            Team
          </Link>
          <Link href="/followup?view=mine" className={cn("rounded px-2 py-1", mineOnly ? "bg-accent-soft text-accent font-medium" : "text-muted hover:text-foreground")}>
            Mine
          </Link>
        </div>
      }
    >
      <ul className="space-y-2">
        {cases.map((c) => (
          <li key={c.id} className={cn("rounded-md border px-3 py-2", c.overdue ? "border-danger/40 bg-red-50/40" : "border-line bg-surface")}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[c.status]}>{c.status.replace("_", " ")}</Badge>
              <Badge tone={PRIORITY_TONE[c.priority]}>{c.priority}</Badge>
              {c.nps !== null && <Badge tone={c.nps >= 9 ? "green" : c.nps >= 7 ? "amber" : "red"}>NPS {c.nps}</Badge>}
              <button className="font-medium hover:underline cursor-pointer" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                {c.title}
              </button>
              <span className="text-xs text-muted">· {c.study}</span>
              <span className="ml-auto text-xs text-muted">
                {c.assignee ? `→ ${c.assignee}` : "unassigned"}
                {c.due && <> · due {c.due}{c.overdue && <strong className="text-danger"> (overdue)</strong>}</>}
              </span>
            </div>
            {c.verbatim && <p className="mt-1 text-sm text-muted">“{c.verbatim}”</p>}

            {openId === c.id && (
              <div className="mt-3 space-y-3 border-t border-line pt-3">
                {canManage && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      aria-label="Status"
                      value={c.status}
                      onChange={(e) =>
                        startTransition(() =>
                          updateCase(c.id, {
                            status: e.target.value,
                            resolution: ["resolved", "dismissed"].includes(e.target.value) ? resolution || undefined : undefined,
                          }),
                        )
                      }
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                    </Select>
                    <Select
                      aria-label="Assignee"
                      value={c.assigneeId ?? ""}
                      onChange={(e) => startTransition(() => updateCase(c.id, { assigneeId: e.target.value || null }))}
                    >
                      <option value="">Unassigned</option>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </Select>
                    {c.assigneeId !== currentUserId && (
                      <Button size="sm" variant="secondary" disabled={pending}
                        onClick={() => startTransition(() => updateCase(c.id, { assigneeId: currentUserId, status: c.status === "new" ? "assigned" : undefined }))}>
                        Take it
                      </Button>
                    )}
                    <Input
                      aria-label="Resolution"
                      className="w-64"
                      placeholder="Resolution / outcome"
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                    />
                  </div>
                )}
                {c.resolution && (
                  <p className="text-sm"><span className="text-muted">Outcome:</span> {c.resolution}</p>
                )}
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Activity</h4>
                  <ul className="space-y-1 text-xs">
                    {c.activity.map((a, i) => (
                      <li key={i} className="text-muted">
                        <span className="text-foreground">{a.actor}</span> · {a.type}
                        {a.type === "note" && a.detail.body ? `: "${String(a.detail.body)}"` : a.detail.to ? ` → ${String(a.detail.to)}` : ""} · {a.at}
                      </li>
                    ))}
                  </ul>
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <Textarea aria-label="New note" rows={1} placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} />
                    <Button size="sm" variant="secondary" disabled={pending || !note.trim()}
                      onClick={() =>
                        startTransition(async () => {
                          await addCaseNote(c.id, note);
                          setNote("");
                        })
                      }>
                      Note
                    </Button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
        {cases.length === 0 && <li className="text-sm text-muted">No cases in this view.</li>}
      </ul>
    </Card>
  );
}

export function RulesPanel({
  rules, studies, canManage,
}: {
  rules: { id: string; name: string; isActive: boolean; study: string; conditions: string; actions: string }[];
  studies: { id: string; title: string }[];
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [studyId, setStudyId] = useState("");
  const [questionCode, setQuestionCode] = useState("nps_score");
  const [op, setOp] = useState("lte");
  const [value, setValue] = useState("6");
  const [assigneeEmail, setAssigneeEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <Card title="Rules">
      <ul className="space-y-1.5">
        {rules.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
            <Badge tone={r.isActive ? "green" : "gray"}>{r.isActive ? "active" : "off"}</Badge>
            <span className="font-medium">{r.name}</span>
            <span className="text-xs text-muted">· {r.study}</span>
            <code className="text-xs text-muted">{r.conditions}</code>
            {canManage && (
              <Button size="sm" variant="ghost" className="ml-auto" disabled={pending}
                onClick={() => startTransition(() => toggleRule(r.id, !r.isActive))}>
                {r.isActive ? "Disable" : "Enable"}
              </Button>
            )}
          </li>
        ))}
        {rules.length === 0 && <li className="text-sm text-muted">No rules defined.</li>}
      </ul>

      {canManage && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">New rule</h3>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-48">
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="fr-name">Name</label>
              <Input id="fr-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="fr-study">Study</label>
              <Select id="fr-study" value={studyId} onChange={(e) => setStudyId(e.target.value)}>
                <option value="">All studies</option>
                {studies.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </Select>
            </div>
            <div className="w-32">
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="fr-code">Question code</label>
              <Input id="fr-code" value={questionCode} onChange={(e) => setQuestionCode(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="fr-op">Op</label>
              <Select id="fr-op" value={op} onChange={(e) => setOp(e.target.value)}>
                {["eq", "ne", "lt", "lte", "gt", "gte", "contains", "answered"].map((o) => <option key={o}>{o}</option>)}
              </Select>
            </div>
            <div className="w-20">
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="fr-value">Value</label>
              <Input id="fr-value" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="w-56">
              <label className="mb-1 block text-xs font-medium text-muted" htmlFor="fr-assignee">Assign case to (email)</label>
              <Input id="fr-assignee" value={assigneeEmail} onChange={(e) => setAssigneeEmail(e.target.value)} placeholder="researcher@example.invalid" />
            </div>
            <Button
              disabled={pending || !name.trim() || !questionCode.trim()}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  try {
                    const num = Number(value);
                    await createRule({
                      name,
                      studyId: studyId || null,
                      conditions: [{ questionCode, op, value: Number.isNaN(num) ? value : num }],
                      actions: [
                        {
                          type: "create_case",
                          title: name,
                          priority: "high",
                          assigneeEmail: assigneeEmail || undefined,
                          dueInHours: 72,
                        },
                        { type: "alert", title: name },
                      ],
                    });
                    setName("");
                  } catch {
                    setError("Could not create the rule (check the values).");
                  }
                })
              }
            >
              Create rule
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <p className="mt-2 text-xs text-muted">
            A rule creates a high-priority case (72 h SLA) and an in-app alert when all conditions match a completed response.
          </p>
        </div>
      )}
    </Card>
  );
}
