"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Input, Label, Select } from "@/components/ui";
import { createRecruitmentPage } from "./actions";

export function CreateRecruitmentPageForm({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-64">
        <Label htmlFor="rp-name">Internt navn</Label>
        <Input id="rp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="fx B2B Brugerpanel" />
      </div>
      <div>
        <Label htmlFor="rp-ws">Arbejdsområde</Label>
        <Select id="rp-ws" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
      </div>
      <Button
        type="button"
        disabled={pending || !name.trim() || !workspaceId}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              const id = await createRecruitmentPage(name, workspaceId);
              router.push(`/panel/recruitment/${id}`);
            } catch {
              setError("Siden kunne ikke oprettes. Kontrollér navn, arbejdsområde og database-status.");
            }
          })
        }
      >
        Opret side
      </Button>
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  );
}
