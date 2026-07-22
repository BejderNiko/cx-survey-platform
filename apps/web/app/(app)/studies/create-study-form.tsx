"use client";

import { useState, useTransition } from "react";
import { Button, Input, Label, Select } from "@/components/ui";
import { createStudy } from "./actions";

export function CreateStudyForm({
  workspaces,
  templates,
}: {
  workspaces: { id: string; name: string }[];
  templates: { id: string; name: string; category: string }[];
}) {
  const [title, setTitle] = useState("");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [templateId, setTemplateId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-64">
        <Label htmlFor="cs-title">Titel</Label>
        <Input id="cs-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="fx Transaktionel NPS — værksted" />
      </div>
      <div>
        <Label htmlFor="cs-ws">Arbejdsområde</Label>
        <Select id="cs-ws" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="cs-tpl">Skabelon</Label>
        <Select id="cs-tpl" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">Tomt spørgeskema</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </div>
      <Button
        disabled={pending || !title.trim() || !workspaceId}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await createStudy({ title, workspaceId, templateId: templateId || null });
            } catch (e) {
              // redirect() kaster internt; vis kun rigtige fejl
              if (e instanceof Error && !e.message.includes("NEXT_REDIRECT")) {
                setError("Studiet kunne ikke oprettes.");
                return;
              }
              throw e;
            }
          })
        }
      >
        Opret og åbn builder
      </Button>
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  );
}
