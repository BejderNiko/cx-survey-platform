"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PrototypeTestConfig } from "@ok/domain";
import { Button, Input } from "@/components/ui";
import { parseFigmaPrototypeUrl } from "@/lib/figma-prototype-url";

const FIGMA_ORIGIN = "https://www.figma.com";
type Frame = { id: string; name: string };
type PickerTarget = "start" | "goal";

export function FigmaFramePicker({ studyId, questionCode, config, onPatch }: {
  studyId: string;
  questionCode: string;
  config: PrototypeTestConfig;
  onPatch: (patch: Partial<PrototypeTestConfig>) => void;
}) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [prototypeLink, setPrototypeLink] = useState("");
  const [connection, setConnection] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pickerInitialFrameId, setPickerInitialFrameId] = useState("");
  const [currentFrame, setCurrentFrame] = useState<Frame | null>(null);
  const [embedLoaded, setEmbedLoaded] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const clientId = process.env.NEXT_PUBLIC_FIGMA_EMBED_CLIENT_ID?.trim();
  const parsedLink = useMemo(() => parseFigmaPrototypeUrl(prototypeLink), [prototypeLink]);

  useEffect(() => {
    fetch("/api/figma/status", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ configured: boolean; connected: boolean }> : null)
      .then(setConnection)
      .catch(() => setConnection(null));
  }, []);

  useEffect(() => {
    if (!pickerTarget) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== FIGMA_ORIGIN || event.source !== iframeRef.current?.contentWindow) return;
      if (!event.data || typeof event.data !== "object") return;
      const message = event.data as { type?: unknown; data?: Record<string, unknown> };
      if (message.type === "INITIAL_LOAD") setEmbedLoaded(true);
      if (message.type !== "PRESENTED_NODE_CHANGED") return;
      const presentedNodeId = message.data?.presentedNodeId;
      if (typeof presentedNodeId !== "string" || !presentedNodeId) return;
      const id = presentedNodeId.replace(/^(\d+)-(\d+)$/, "$1:$2");
      setCurrentFrame({ id, name: frames.find((frame) => frame.id === id)?.name ?? `Frame ${id}` });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frames, pickerTarget]);

  const pickerSrc = useMemo(() => {
    if (!pickerTarget || !clientId || !config.fileKey) return null;
    const initialId = pickerInitialFrameId;
    const params = new URLSearchParams({ "embed-host": "cx-survey-platform", "client-id": clientId, footer: "false" });
    if (initialId) {
      params.set("node-id", initialId.replaceAll(":", "-"));
      params.set("starting-point-node-id", initialId.replaceAll(":", "-"));
    }
    return `https://embed.figma.com/proto/${encodeURIComponent(config.fileKey)}?${params.toString()}`;
  }, [clientId, config.fileKey, pickerInitialFrameId, pickerTarget]);

  async function loadThumbnail(frameId: string) {
    if (!connection?.connected || !config.fileKey || thumbnails[frameId]) return;
    const params = new URLSearchParams({ fileKey: config.fileKey, frameId, studyId, questionCode });
    const response = await fetch(`/api/figma/thumbnail?${params}`, { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json() as { imageUrl: string };
    setThumbnails((current) => ({ ...current, [frameId]: result.imageUrl }));
  }

  async function syncFrames() {
    setStatus("Henter verificerede Figma-frames…");
    const params = new URLSearchParams({ fileKey: config.fileKey, studyId, questionCode });
    const response = await fetch(`/api/figma/frames?${params}`, { cache: "no-store" });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: unknown } | null;
      setStatus(figmaSyncErrorMessage(typeof body?.error === "string" ? body.error : "", response.status));
      return;
    }
    const result = await response.json() as { name: string; versionId: string; frames: Frame[]; flowStartingPoints: Frame[] };
    setFrames(result.frames);
    const defaultStart = config.startFrameId ? null : result.flowStartingPoints[0] ?? null;
    setStatus(`${result.frames.length} frames og ${result.flowStartingPoints.length} prototype-flow(s) hentet fra Figma.`);
    onPatch({
      prototypeName: result.name,
      versionId: result.versionId,
      lastSyncedAt: new Date().toISOString(),
      ...(defaultStart ? { startFrameId: defaultStart.id, startFrameName: defaultStart.name } : {}),
    });
    const startId = config.startFrameId || defaultStart?.id;
    if (startId) void loadThumbnail(startId);
    if (config.goalFrameId) void loadThumbnail(config.goalFrameId);
  }

  function importPrototype() {
    if (!parsedLink) {
      setStatus("Indsæt et gyldigt https://www.figma.com/proto/… link.");
      return;
    }
    onPatch({
      fileKey: parsedLink.fileKey,
      prototypeName: parsedLink.prototypeName,
      startFrameId: parsedLink.nodeId ?? config.startFrameId,
      startFrameName: parsedLink.nodeId ? `Frame ${parsedLink.nodeId}` : config.startFrameName,
      goalFrameId: parsedLink.fileKey === config.fileKey ? config.goalFrameId : undefined,
      goalFrameName: parsedLink.fileKey === config.fileKey ? config.goalFrameName : undefined,
      versionId: undefined,
      lastSyncedAt: undefined,
    });
    setFrames([]);
    setThumbnails({});
    setStatus("Prototype importeret i kladden. Gem ændringer, forbind Figma OAuth og hent frames.");
  }

  function openPicker(target: PickerTarget) {
    const selectedId = target === "start" ? config.startFrameId : config.goalFrameId;
    const selectedName = target === "start" ? config.startFrameName : config.goalFrameName;
    setCurrentFrame(selectedId ? { id: selectedId, name: selectedName || frames.find((frame) => frame.id === selectedId)?.name || `Frame ${selectedId}` } : null);
    setEmbedLoaded(false);
    setPickerInitialFrameId(selectedId || config.startFrameId);
    setPickerTarget(target);
  }

  function selectCurrentFrame() {
    if (!pickerTarget || !currentFrame) return;
    if (pickerTarget === "goal" && currentFrame.id === config.startFrameId) {
      setStatus("Målskærm skal være forskellig fra startskærm.");
      return;
    }
    if (pickerTarget === "start") {
      const patch: Partial<PrototypeTestConfig> = { startFrameId: currentFrame.id, startFrameName: currentFrame.name };
      if (config.goalFrameId === currentFrame.id) {
        patch.goalFrameId = undefined;
        patch.goalFrameName = undefined;
      }
      onPatch(patch);
    } else {
      onPatch({ goalFrameId: currentFrame.id, goalFrameName: currentFrame.name });
    }
    void loadThumbnail(currentFrame.id);
    setPickerTarget(null);
    setStatus(`${pickerTarget === "start" ? "Startskærm" : "Målskærm"} valgt: ${currentFrame.name}.`);
  }

  const startFrame = config.startFrameId ? { id: config.startFrameId, name: config.startFrameName || frames.find((frame) => frame.id === config.startFrameId)?.name || "Valgt startskærm" } : null;
  const goalFrame = config.goalFrameId ? { id: config.goalFrameId, name: config.goalFrameName || frames.find((frame) => frame.id === config.goalFrameId)?.name || "Valgt målskærm" } : null;

  return <div className="space-y-4">
    <div className="rounded-xl border border-line bg-surface-raised p-4">
      <label className="block text-xs font-semibold text-slate-800">
        Figma prototype link
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <Input value={prototypeLink} onChange={(event) => setPrototypeLink(event.target.value)} placeholder="https://www.figma.com/proto/FILE_KEY/Prototype…" inputMode="url" />
          <Button type="button" variant="secondary" disabled={!parsedLink} onClick={importPrototype}>Import prototype</Button>
        </div>
      </label>
      {prototypeLink && <p className={`mt-2 text-xs ${parsedLink ? "text-emerald-700" : "text-red-700"}`} role={parsedLink ? "status" : "alert"}>{parsedLink ? "Klar til import" : "Link skal være et officielt Figma /proto/ link."}</p>}
      {config.fileKey && <p className="mt-2 text-xs text-slate-600"><strong>{config.prototypeName || "Figma prototype"}</strong> · filreference gemt sikkert i kladden</p>}
    </div>

    {config.fileKey && <div className="rounded-xl border border-line p-4 text-xs text-slate-600">
      <div className="flex flex-wrap items-center gap-2">
        {connection?.configured ? <a className={`inline-flex h-7 items-center rounded-full border border-line px-3 text-xs ${config.fileKey ? "" : "pointer-events-none opacity-50"}`} href={`/api/figma/connect?studyId=${encodeURIComponent(studyId)}&questionCode=${encodeURIComponent(questionCode)}`}>{connection.connected ? "Reconnect Figma OAuth" : "Connect Figma OAuth"}</a> : <Button size="sm" variant="secondary" type="button" disabled title="Kræver Figma OAuth client, server-only secret og registreret callback">Connect Figma OAuth</Button>}
        {connection?.connected && <Button size="sm" variant="secondary" type="button" onClick={() => void syncFrames()}>Resync with Figma</Button>}
        {connection?.connected && <Button size="sm" variant="ghost" type="button" onClick={async () => {
          const response = await fetch("/api/figma/disconnect", { method: "POST" });
          if (response.ok) { setConnection((current) => current ? { ...current, connected: false } : current); setFrames([]); setStatus("Figma OAuth disconnected."); }
          else setStatus("Figma OAuth kunne ikke afbrydes.");
        }}>Disconnect</Button>}
        <Button size="sm" variant="ghost" type="button" onClick={() => {
          onPatch({ fileKey: "", prototypeName: undefined, startFrameId: "", startFrameName: undefined, goalFrameId: undefined, goalFrameName: undefined, versionId: undefined, lastSyncedAt: undefined });
          setFrames([]); setThumbnails({}); setPrototypeLink(""); setStatus("Figma-link fjernet fra kladden.");
        }}>Remove</Button>
        {config.lastSyncedAt && <span className="ml-auto text-emerald-700">● Synkroniseret {new Date(config.lastSyncedAt).toLocaleString("da-DK")}</span>}
      </div>
      {!connection?.connected && <p className="mt-2">Gem kladden. Vælg derefter Connect Figma OAuth. OAuth kan kun bindes til et gemt prototype-spørgsmål.</p>}
    </div>}

    {config.fileKey && <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-4">
      <div className={`grid gap-3 ${config.flowType === "task" ? "sm:grid-cols-[1fr_auto_1fr]" : "sm:grid-cols-1"}`}>
        <FrameCard label="Starting point" frame={startFrame} thumbnail={startFrame ? thumbnails[startFrame.id] : undefined} onChange={() => openPicker("start")} disabled={!clientId} />
        {config.flowType === "task" && <div className="hidden items-center text-xl text-slate-400 sm:flex">→</div>}
        {config.flowType === "task" && <FrameCard label="Goal screen" frame={goalFrame} thumbnail={goalFrame ? thumbnails[goalFrame.id] : undefined} onChange={() => openPicker("goal")} disabled={!clientId || !config.startFrameId} />}
      </div>
      <p className="mt-3 text-center text-xs text-slate-600">{config.flowType === "task" ? "Testen lykkes, når deltageren når målskærmen." : "Free flow kræver kun et startpunkt."}</p>
    </div>}

    {status && <p className="text-xs text-slate-600" role="status">{status}</p>}

    {pickerTarget && <div className="fixed inset-0 z-[80] flex flex-col bg-slate-950/80 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={pickerTarget === "start" ? "Vælg startskærm" : "Vælg målskærm"}>
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div><p className="font-semibold text-slate-950">{pickerTarget === "start" ? "Vælg startskærm" : "Vælg målskærm"}</p><p className="text-xs text-slate-500">Klik gennem prototypen. Vælg derefter skærmen, som vises nu.</p></div>
          <Button type="button" variant="ghost" onClick={() => setPickerTarget(null)}>Luk</Button>
        </div>
        <div className="min-h-0 flex-1 bg-slate-100 p-2">
          {pickerSrc ? <iframe ref={iframeRef} title="Vælg Figma-frame" src={pickerSrc} className="h-full min-h-[480px] w-full rounded-lg border border-line bg-white" allow="fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <p role="alert" className="p-6 text-sm">Figma Embed client ID eller prototype-link mangler.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
          <div className="min-w-0 flex-1"><p className="text-xs text-slate-500">Aktuel skærm</p><p className="truncate text-sm font-semibold">{currentFrame?.name ?? (embedLoaded ? "Navigér til ønsket skærm" : "Venter på Figma…")}</p></div>
          <Button type="button" disabled={!currentFrame} onClick={selectCurrentFrame}>Vælg denne skærm</Button>
        </div>
      </div>
    </div>}
  </div>;
}

function figmaSyncErrorMessage(code: string, status: number): string {
  if (code === "figma_scope_missing") return "Figma OAuth-appen mangler scope file_content:read. Vælg scopet under OAuth scopes i Figma, gem/publicér app-konfigurationen, og vælg derefter Reconnect Figma OAuth.";
  if (code === "figma_file_permission_denied") return "Figma-kontoen, som godkendte OAuth, mangler filadgang i Figma. Del filen med kontoen direkte eller via projekt/team; linkvisning alene giver ikke REST API-adgang. Reconnect derefter.";
  if (code === "figma_token_rejected" || code === "figma_not_connected") return "Figma-token er udløbet eller afvist. Vælg Reconnect Figma OAuth og godkend igen.";
  if (code === "figma_file_mismatch") return "Figma-linket matcher ikke den gemte kladde. Gem kladden, genindlæs builderen og prøv igen.";
  if (code === "figma_file_not_found") return "Figma-filen blev ikke fundet. Importér det fulde prototype-link igen og kontrollér, at linket peger på en Figma Design-prototype.";
  if (code === "figma_rate_limited") return "Figma begrænser API-kald midlertidigt. Vent ét minut og prøv Resync igen.";
  if (code === "forbidden") return "Din platformrolle har ikke adgang til at redigere dette studie.";
  if (code === "figma_rest_forbidden" || status === 403) return "Figma REST API afviser kaldet (403). Kontrollér, at OAuth-appen har file_content:read, og at OAuth-kontoen har filen via direkte deling eller projekt/team. Reconnect derefter.";
  return `Figma-sync fejlede (HTTP ${status}). Prøv Reconnect Figma OAuth. Hvis fejlen fortsætter, kontrollér OAuth-scope og kontoens filadgang.`;
}
function FrameCard({ label, frame, thumbnail, onChange, disabled }: { label: string; frame: Frame | null; thumbnail?: string; onChange: () => void; disabled: boolean }) {
  return <div className="flex min-h-28 items-center gap-3 rounded-xl border border-line bg-white p-3">
    <div className="grid h-20 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-slate-100 bg-cover bg-center text-center text-[10px] text-slate-500" style={thumbnail ? { backgroundImage: `url("${thumbnail.replaceAll('"', '%22')}")` } : undefined} role="img" aria-label={frame ? `Preview af ${frame.name}` : "Ingen frame valgt"}>{!thumbnail && (frame ? "Preview hentes efter Figma sync" : "Vælg frame")}</div>
    <div className="min-w-0 flex-1"><p className="text-xs font-medium text-cyan-700">{label}</p><p className="mt-1 truncate text-sm font-semibold text-slate-950">{frame?.name ?? "Ikke valgt"}</p><Button className="mt-2" type="button" size="sm" variant="secondary" disabled={disabled} onClick={onChange}>{frame ? "Change" : "Choose"}</Button></div>
  </div>;
}
