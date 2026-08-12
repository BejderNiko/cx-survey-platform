"use client";

import { useState } from "react";
import type { PrototypeTestConfig } from "@ok/domain";
import { Button, Select } from "@/components/ui";

export function FigmaFramePicker({ config, onPatch }: {
  config: PrototypeTestConfig;
  onPatch: (patch: Partial<PrototypeTestConfig>) => void;
}) {
  const [frames, setFrames] = useState<{ id: string; name: string }[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  return <div className="mt-2 space-y-2">
    <Button size="sm" variant="secondary" type="button" disabled={!config.fileKey} onClick={async () => {
      const response = await fetch(`/api/figma/frames?fileKey=${encodeURIComponent(config.fileKey)}`);
      if (!response.ok) { setStatus("Figma-forbindelse eller filadgang mangler."); return; }
      const result = await response.json() as { name: string; versionId: string; frames: { id: string; name: string }[] };
      setFrames(result.frames); setStatus(`${result.frames.length} frames hentet.`);
      onPatch({ prototypeName: result.name, versionId: result.versionId, lastSyncedAt: new Date().toISOString() });
    }}>Resync / hent frames</Button>
    {frames.length > 0 && <div className="grid gap-2 sm:grid-cols-2">
      <label>Starting frame <Select value={config.startFrameId} onChange={(event) => onPatch({ startFrameId: event.target.value })}>{frames.map((frame) => <option key={frame.id} value={frame.id}>{frame.name}</option>)}</Select></label>
      {config.flowType === "task" && <label>Goal frame <Select value={config.goalFrameId ?? ""} onChange={(event) => { const frame = frames.find((item) => item.id === event.target.value); onPatch({ goalFrameId: frame?.id, goalFrameName: frame?.name }); }}><option value="">Vælg goal</option>{frames.map((frame) => <option key={frame.id} value={frame.id}>{frame.name}</option>)}</Select></label>}
    </div>}
    {status && <p role="status">{status}</p>}
  </div>;
}
