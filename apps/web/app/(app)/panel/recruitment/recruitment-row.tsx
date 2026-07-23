"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge, Button, cn } from "@/components/ui";
import { cloneRecruitmentPage, setRecruitmentPageActive } from "./actions";

export function RecruitmentRow({
  id, internalName, isActive, publicToken, questionLabels, submissionCount, appBaseUrl,
}: {
  id: string;
  internalName: string;
  isActive: boolean;
  publicToken: string;
  questionLabels: string[];
  submissionCount: number;
  appBaseUrl: string;
}) {
  const [active, setActive] = useState(isActive);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const url = `${appBaseUrl}/r/${publicToken}`;

  return (
    <div className="grid grid-cols-1 gap-4 rounded-xl border border-line bg-surface p-4 shadow-card sm:grid-cols-[1.2fr_1.1fr_1.4fr_auto]">
      <div className="min-w-0">
        <p className="font-medium text-heading">{internalName}</p>
        <p className="mt-1 text-xs text-muted">
          {submissionCount} {submissionCount === 1 ? "tilmelding" : "tilmeldinger"}
        </p>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Side aktiv</p>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const next = !active;
              setActive(next);
              await setRecruitmentPageActive(id, next);
            })
          }
          className={cn(
            "inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer",
            active ? "bg-success" : "bg-line-strong",
          )}
        >
          <span className={cn("inline-block h-4.5 w-4.5 transform rounded-full bg-white transition-transform", active ? "translate-x-6" : "translate-x-1")} />
        </button>
        <span className="ml-2 text-sm">{active ? "Ja" : "Nej"}</span>
        <div className="mt-2 flex items-center gap-1.5">
          <a href={url} target="_blank" rel="noreferrer" className="truncate text-xs text-accent underline">
            /r/{publicToken}
          </a>
          <button
            type="button"
            className="shrink-0 text-xs text-muted hover:text-accent cursor-pointer"
            onClick={() => {
              void navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Kopieret ✓" : "Kopiér"}
          </button>
        </div>
      </div>

      <div className="min-w-0">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Spørgsmål</p>
        {questionLabels.length === 0 ? (
          <p className="text-xs text-muted">Ingen spørgsmål tilføjet.</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {questionLabels.map((l) => <Badge key={l}>{l}</Badge>)}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
        <Link href={`/panel/recruitment/${id}`}>
          <Button size="sm" variant="secondary" className="w-full sm:w-24">Redigér</Button>
        </Link>
        <Button
          size="sm"
          variant="ghost"
          className="w-full sm:w-24"
          disabled={pending}
          onClick={() => startTransition(() => cloneRecruitmentPage(id))}
        >
          Klon
        </Button>
      </div>
    </div>
  );
}
