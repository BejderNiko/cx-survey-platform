"use client";

import { useState, useTransition } from "react";
import { Button, Input, Label, Select } from "@/components/ui";
import { createPanelInvite, createPublicLink } from "../../distribution-actions";

export function CreateDistributionForms({
  studyId,
  segments,
}: {
  studyId: string;
  segments: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [linkName, setLinkName] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [method, setMethod] = useState<"all" | "random">("random");
  const [sampleSize, setSampleSize] = useState(50);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-48">
          <Label htmlFor="dl-name">Navn på offentligt link</Label>
          <Input id="dl-name" value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Offentligt link" />
        </div>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                const res = await createPublicLink(studyId, linkName);
                setResult(`Offentligt link oprettet: ${res.url}`);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Linket kunne ikke oprettes.");
              }
            })
          }
        >
          Opret offentligt link
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-48">
          <Label htmlFor="di-name">Navn på invitation</Label>
          <Input id="di-name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Panelinvitation" />
        </div>
        <div>
          <Label htmlFor="di-seg">Segment</Label>
          <Select id="di-seg" value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
            <option value="">Alle aktive panelister</option>
            {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="di-method">Udvælgelse</Label>
          <Select id="di-method" value={method} onChange={(e) => setMethod(e.target.value as "all" | "random")}>
            <option value="random">Tilfældig stikprøve (med seed)</option>
            <option value="all">Alle egnede</option>
          </Select>
        </div>
        {method === "random" && (
          <div className="w-24">
            <Label htmlFor="di-size">Stikprøve</Label>
            <Input id="di-size" type="number" min={1} value={sampleSize}
              onChange={(e) => setSampleSize(Number(e.target.value))} />
          </div>
        )}
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                const res = await createPanelInvite({
                  studyId, name: inviteName, segmentId: segmentId || null, method,
                  sampleSize: method === "random" ? sampleSize : undefined,
                });
                setResult(
                  `${res.invited} af ${res.candidates} kandidater inviteret (${res.eligible} egnede efter kontaktregler; udeladt: ${
                    Object.entries(res.excluded).map(([k, v]) => `${k}=${v}`).join(", ") || "ingen"
                  }). Beskederne ligger i den simulerede udbakke.`,
                );
              } catch (e) {
                setError(e instanceof Error ? e.message : "Invitationerne kunne ikke oprettes.");
              }
            })
          }
        >
          Send invitationer (simuleret)
        </Button>
      </div>
      {result && <p className="text-sm text-success">{result}</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
