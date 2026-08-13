"use client";

import { useEffect, useState } from "react";
import type { PrototypeTestConfig } from "@ok/domain";
import { Button, Select } from "@/components/ui";

export function FigmaFramePicker({ studyId, questionCode, config, onPatch }: {
  studyId: string;
  questionCode: string;
  config: PrototypeTestConfig;
  onPatch: (patch: Partial<PrototypeTestConfig>) => void;
}) {
  const [frames, setFrames] = useState<{ id: string; name: string }[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [connection, setConnection] = useState<{ configured: boolean; connected: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/figma/status", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ configured: boolean; connected: boolean }> : null)
      .then(setConnection)
      .catch(() => setConnection(null));
  }, []);

  return <div className="mt-2 space-y-2">
    <div className="flex flex-wrap gap-2">
      {connection?.configured ? <a className="inline-flex h-7 items-center rounded-full border border-line px-3 text-xs" href={`/api/figma/connect?studyId=${encodeURIComponent(studyId)}&questionCode=${encodeURIComponent(questionCode)}`}>{connection.connected ? "Reconnect Figma OAuth" : "Connect Figma OAuth"}</a> : <Button size="sm" variant="secondary" type="button" disabled title="Kræver Figma OAuth client, server-only secret og registreret callback">Connect Figma OAuth</Button>}
      {connection?.connected && <Button size="sm" variant="ghost" type="button" onClick={async () => {
        const response = await fetch("/api/figma/disconnect", { method: "POST" });
        if (response.ok) { setConnection((current) => current ? { ...current, connected: false } : current); setFrames([]); setStatus("Figma OAuth disconnected."); }
        else setStatus("Figma OAuth kunne ikke afbrydes.");
      }}>Disconnect Figma OAuth</Button>}
      <Button size="sm" variant="secondary" type="button" disabled={!config.fileKey || !connection?.connected} onClick={async () => {
        setStatus("Henter verificerede Figma-frames…");
        const params = new URLSearchParams({ fileKey: config.fileKey, studyId, questionCode });
        const response = await fetch(`/api/figma/frames?${params}`, { cache: "no-store" });
        if (!response.ok) { setStatus("Figma-forbindelse eller filadgang mangler."); return; }
        const result = await response.json() as { name: string; versionId: string; frames: { id: string; name: string }[] };
        setFrames(result.frames);
        setStatus(`${result.frames.length} frames hentet fra Figma REST API.`);
        onPatch({ prototypeName: result.name, versionId: result.versionId, lastSyncedAt: new Date().toISOString() });
      }}>Resync / hent frames</Button>
    </div>
    {frames.length > 0 && <div className="grid gap-2 sm:grid-cols-2">
      <label>Starting frame <Select value={config.startFrameId} onChange={(event) => onPatch({ startFrameId: event.target.value })}>{!frames.some((frame) => frame.id === config.startFrameId) && <option value="">Vælg start</option>}{frames.map((frame) => <option key={frame.id} value={frame.id}>{frame.name}</option>)}</Select></label>
      {config.flowType === "task" && <label>Goal frame <Select value={config.goalFrameId ?? ""} onChange={(event) => { const frame = frames.find((item) => item.id === event.target.value); onPatch({ goalFrameId: frame?.id, goalFrameName: frame?.name }); }}><option value="">Vælg goal</option>{frames.map((frame) => <option key={frame.id} value={frame.id}>{frame.name}</option>)}</Select></label>}
    </div>}
    {status && <p role="status">{status}</p>}
    <p>Live Embed-eventverifikation er fortsat falsk, indtil en rigtig prototype er gennemtestet på en tilladt origin.</p>
  </div>;
}
