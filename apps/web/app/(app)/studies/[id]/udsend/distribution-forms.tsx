"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Input, Label, Select } from "@/components/ui";
import { createPanelInvite, createPublicLink, previewPanelAudience, type PanelAudiencePreview } from "../../distribution-actions";
import { PanelFilterPanel, type FilterField, type MessageOption } from "../../../panel/panel-filter-panel";

export function CreateDistributionForms({
  studyId,
  segments,
  filterFields,
  messages,
  panelTotal,
}: {
  studyId: string;
  segments: { id: string; name: string }[];
  filterFields: FilterField[];
  messages: MessageOption[];
  panelTotal: number;
}) {
  const [pending, startTransition] = useTransition();
  const [linkName, setLinkName] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [method, setMethod] = useState<"all" | "random">("random");
  const [sampleSize, setSampleSize] = useState(50);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panelFilters, setPanelFilters] = useState<string | null>("[]");
  const [filterComplete, setFilterComplete] = useState(true);
  const [audience, setAudience] = useState<PanelAudiencePreview | null>(null);
  const [audienceKey, setAudienceKey] = useState<string | null>(null);
  const previewRequest = useRef(0);
  const previewKey = filterComplete
    ? JSON.stringify({ segmentId: segmentId || null, method, sampleSize: method === "random" ? sampleSize : null, filters: panelFilters ?? "[]" })
    : "incomplete";
  const resolvedAudience = filterComplete && audienceKey === previewKey ? audience : null;
  const previewPending = filterComplete && audienceKey !== previewKey;

  useEffect(() => {
    const requestId = ++previewRequest.current;
    if (!filterComplete) return;
    previewPanelAudience({
      studyId,
      segmentId: segmentId || null,
      method,
      sampleSize: method === "random" ? sampleSize : undefined,
      filters: panelFilters ?? "[]",
    })
      .then((nextAudience) => {
        if (requestId !== previewRequest.current) return;
        setAudience(nextAudience);
        setAudienceKey(previewKey);
        setError(null);
      })
      .catch((previewError) => {
        if (requestId !== previewRequest.current) return;
        setAudience(null);
        setAudienceKey(previewKey);
        setError(previewError instanceof Error ? previewError.message : "Audience preview could not be calculated.");
      });
  }, [filterComplete, method, panelFilters, previewKey, sampleSize, segmentId, studyId]);

  function createLink() {
    startTransition(async () => {
      setError(null);
      try {
        const res = await createPublicLink(studyId, linkName);
        setResult("Public link created: " + res.url);
      } catch (createError) {
        setError(createError instanceof Error ? createError.message : "Public link could not be created.");
      }
    });
  }

  function createInvite() {
    if (!resolvedAudience || resolvedAudience.blockingReason || !filterComplete) return;
    startTransition(async () => {
      setError(null);
      try {
        const res = await createPanelInvite({
          studyId,
          name: inviteName,
          segmentId: segmentId || null,
          method,
          sampleSize: method === "random" ? sampleSize : undefined,
          filters: panelFilters ?? "[]",
        });
        setResult(
          res.invited + " of " + res.candidates + " candidates invited (" + res.eligible +
          " eligible after contact rules; excluded: " +
          (Object.entries(res.excluded).map(([key, value]) => key + "=" + value).join(", ") || "none") +
          "). No real messages are sent.",
        );
      } catch (createError) {
        setError(createError instanceof Error ? createError.message : "Invitations could not be created.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-48">
          <Label htmlFor="dl-name">Public link name</Label>
          <Input id="dl-name" value={linkName} onChange={(event) => setLinkName(event.target.value)} placeholder="Public link" />
        </div>
        <Button variant="secondary" disabled={pending} onClick={createLink}>Create public link</Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-48">
          <Label htmlFor="di-name">Invitation name</Label>
          <Input id="di-name" value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Panel invitation" />
        </div>
        <div>
          <Label htmlFor="di-seg">Segment</Label>
          <Select id="di-seg" value={segmentId} onChange={(event) => setSegmentId(event.target.value)}>
            <option value="">All active panelists</option>
            {segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="di-method">Selection</Label>
          <Select id="di-method" value={method} onChange={(event) => setMethod(event.target.value as "all" | "random")}>
            <option value="random">Random sample</option>
            <option value="all">All eligible</option>
          </Select>
        </div>
        {method === "random" && (
          <div className="w-24">
            <Label htmlFor="di-size">Sample size</Label>
            <Input id="di-size" type="number" min={1} value={sampleSize} onChange={(event) => setSampleSize(Number(event.target.value))} />
          </div>
        )}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 rounded-xl border border-line bg-surface p-4" aria-label="Panelist preview">
          <div className="flex items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-heading">Panelists</h3><p className="mt-1 text-xs text-muted">Preview of matching panelists.</p></div>{resolvedAudience && <span className="text-xs text-muted">{resolvedAudience.candidates} matches</span>}</div>
          {previewPending && <p className="mt-4 text-sm text-muted">Calculating audience…</p>}
          {!previewPending && resolvedAudience && (resolvedAudience.panelists.length > 0 ? <div className="mt-3 overflow-x-auto rounded-lg border border-line"><table className="w-full border-collapse text-sm"><thead><tr><th className="border-b border-line px-3 py-2 text-left text-[11px] uppercase tracking-wider text-muted">Name</th><th className="border-b border-line px-3 py-2 text-left text-[11px] uppercase tracking-wider text-muted">Email</th></tr></thead><tbody>{resolvedAudience.panelists.map((panelist) => <tr key={panelist.id}><td className="border-b border-line/60 px-3 py-2">{panelist.name}</td><td className="border-b border-line/60 px-3 py-2 text-muted">{panelist.email}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-muted">No panelists match current filters.</p>)}
          {!previewPending && !resolvedAudience && <p className="mt-4 text-sm text-muted">Choose filters to preview panelists.</p>}
        </section>
        <div className="min-w-0">
      <PanelFilterPanel
        fields={filterFields}
        messages={messages}
        initialFilters={[]}
        total={panelTotal}
        filtered={resolvedAudience?.candidates ?? null}
        navigation={false}
        onFiltersChange={(serialized) => {
          setPanelFilters(serialized);
          setFilterComplete(true);
        }}
        onFilterValidityChange={(complete) => {
          setFilterComplete(complete);
          if (!complete) setPanelFilters(null);
        }}
      />
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface-raised px-4 py-3">
        <p className="text-sm font-semibold text-heading">Audience preview</p>
        {previewPending && <p role="status" className="mt-1 text-sm text-muted">Calculating audience…</p>}
        {!previewPending && !filterComplete && <p role="alert" className="mt-1 text-sm text-danger">Complete every filter group before sending.</p>}
        {!previewPending && resolvedAudience && (
          <p role="status" className="mt-1 text-sm text-muted">
            {resolvedAudience.candidates} candidates · {resolvedAudience.eligible} eligible after contact rules · {resolvedAudience.selected} selected
          </p>
        )}
        {resolvedAudience?.blockingReason && <p role="alert" className="mt-1 text-sm text-danger">{resolvedAudience.blockingReason}</p>}
      </div>

      <Button disabled={pending || previewPending || !resolvedAudience || Boolean(resolvedAudience.blockingReason) || !filterComplete} onClick={createInvite}>
        Create invitations
      </Button>
      {result && <p className="text-sm text-success">{result}</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
