"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState, useTransition } from "react";
import type { PrototypePath } from "@/lib/prototype-results";
import { groupCommonPaths } from "@/lib/prototype-results";
import type { ResultFilter } from "@/lib/results-filters";
import { mergeResultFilters, trySerializeResultFilters } from "@/lib/results-filters";
import { renamePrototypePath } from "./report-job-actions";

type Screenshot = { frameId: string; frameName: string; assetId: string; coordinateScale: number };
type ModalFrame = { frameId: string; durationMs: number; clicks: PrototypePath["clicks"] };

export function PrototypeResultView({
  studyId, studyVersionId, questionCode, flowType, goalFrameId, paths, filters, screenshots, canRenamePaths, pathLabels,
}: {
  studyId: string;
  studyVersionId: string;
  questionCode: string;
  flowType: "task" | "free";
  goalFrameId?: string;
  paths: PrototypePath[];
  filters: ResultFilter[];
  screenshots: Screenshot[];
  canRenamePaths: boolean;
  pathLabels: Record<string, string>;
}) {
  const [mode, setMode] = useState<"common" | "individual">("common");
  const [sort, setSort] = useState<"participants" | "time" | "clicks">("participants");
  const [expanded, setExpanded] = useState(false);
  const [names, setNames] = useState<Record<string, string>>(pathLabels);
  const [savedNames, setSavedNames] = useState<Record<string, string>>(pathLabels);
  const [renamePending, startRename] = useTransition();
  const [renameStatus, setRenameStatus] = useState<{ message: string; error: boolean } | null>(null);
  const [modal, setModal] = useState<{ frames: ModalFrame[]; index: number } | null>(null);
  const [tab, setTab] = useState<"image" | "heatmap" | "clicks">("image");
  const [clickScope, setClickScope] = useState<"all" | "misclicks">("all");
  const screenshotsByFrame = useMemo(() => new Map(screenshots.map((item) => [item.frameId, item])), [screenshots]);
  const common = groupCommonPaths(paths).map((group) => ({
    key: group.signature,
    signature: group.signature,
    participantCount: group.participantCount,
    elapsedMs: group.averageElapsedMs,
    clickCount: group.clickCount,
    misclickCount: group.misclickCount,
    visits: group.averageVisits,
  }));
  const individual = paths.map((path) => ({
    key: path.responseId,
    signature: path.signature,
    participantCount: 1,
    elapsedMs: path.elapsedMs,
    clickCount: path.clicks.length,
    misclickCount: path.clicks.filter((click) => click.isMisclick).length,
    visits: path.visits,
  }));
  const rows = [...(mode === "common" ? common : individual)].sort((left, right) => {
    if (sort === "time") return right.elapsedMs - left.elapsedMs;
    if (sort === "clicks") return right.clickCount - left.clickCount;
    return right.participantCount - left.participantCount || left.key.localeCompare(right.key);
  });
  const visible = expanded ? rows : rows.slice(0, 10);
  const activeFrame = modal?.frames[modal.index];
  const activeScreenshot = activeFrame ? screenshotsByFrame.get(activeFrame.frameId) : undefined;
  const visibleClicks = activeFrame ? (clickScope === "misclicks" ? activeFrame.clicks.filter((click) => click.isMisclick) : activeFrame.clicks) : [];
  const savePathName = (signature: string, label: string, fallback: string) => {
    const previous = savedNames[signature] ?? fallback;
    setRenameStatus(null);
    startRename(async () => {
      try {
        const result = await renamePrototypePath({ studyId, studyVersionId, questionCode, signature, label });
        if (!result.ok) {
          setNames((current) => ({ ...current, [signature]: previous }));
          setRenameStatus({ message: result.error, error: true });
          return;
        }
        setSavedNames((current) => ({ ...current, [signature]: label }));
        setNames((current) => ({ ...current, [signature]: label }));
        setRenameStatus({ message: "Path-navn gemt.", error: false });
      } catch {
        setNames((current) => ({ ...current, [signature]: previous }));
        setRenameStatus({ message: "Path-navnet kunne ikke gemmes. Tidligere navn er gendannet.", error: true });
      }
    });
  };

  return <div className="mt-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex rounded-md border border-line p-0.5 text-xs">
        <button type="button" onClick={() => setMode("common")} className={`rounded px-3 py-1.5 ${mode === "common" ? "bg-accent text-white" : ""}`}>Common paths ({common.length})</button>
        <button type="button" onClick={() => setMode("individual")} className={`rounded px-3 py-1.5 ${mode === "individual" ? "bg-accent text-white" : ""}`}>Individual paths ({individual.length})</button>
      </div>
      <label className="text-xs">Sort by <select className="ml-1 rounded border border-line bg-surface px-2 py-1" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="participants">Participants</option><option value="time">Time</option><option value="clicks">Clicks</option></select></label>
    </div>
    {visible.map((row, index) => {
      const reachedGoal = Boolean(goalFrameId && row.visits.some((visit) => visit.frameId === goalFrameId));
      const pathFilter: ResultFilter = mode === "individual"
        ? { kind: "respondent", responseId: row.key }
        : { kind: "path", questionCode, signature: row.signature };
      const serializedFilter = trySerializeResultFilters(mergeResultFilters(filters, [pathFilter]));
      const filterHref = serializedFilter.ok ? `/studies/${studyId}/results?filters=${encodeURIComponent(serializedFilter.value)}` : null;
      const filterError = serializedFilter.ok ? null : serializedFilter.message;
      return <article key={row.key} className="rounded-lg border border-line p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><input aria-label="Path name" readOnly={mode !== "common" || !canRenamePaths || renamePending} className="w-36 rounded border border-transparent bg-transparent px-1 text-sm font-semibold hover:border-line focus:border-line read-only:cursor-default" value={mode === "common" ? names[row.signature] ?? `Path ${index + 1}` : `Participant ${index + 1}`} onChange={(event) => setNames((current) => ({ ...current, [row.signature]: event.target.value.slice(0, 80) }))} onBlur={(event) => { if (mode !== "common" || !canRenamePaths || !studyVersionId) return; const fallback = pathLabels[row.signature] ?? `Path ${index + 1}`; const label = event.target.value.trim(); if (!label) { setNames((current) => ({ ...current, [row.signature]: savedNames[row.signature] ?? fallback })); return; } savePathName(row.signature, label, fallback); }} /><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${flowType === "free" || reachedGoal ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{flowType === "free" ? "FREE FLOW" : reachedGoal ? "REACHED GOAL SCREEN" : "DIDN'T REACH GOAL SCREEN"}</span></div>
          {filterHref ? <a href={filterHref} className="text-xs text-accent">⌁ Filter globalt</a> : <span role="alert" className="text-xs text-rose-700">{filterError}</span>}
        </div>
        <p className="mt-2 text-xs text-muted">{row.participantCount} participant(s) · {formatSeconds(row.elapsedMs)} · {row.clickCount} clicks · {misclickPercent(row.misclickCount, row.clickCount)} % misclicks</p>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
          {row.visits.map((visit, frameIndex) => {
            const screenshot = screenshotsByFrame.get(visit.frameId);
            return <button key={`${visit.frameId}-${frameIndex}`} type="button" disabled={!screenshot} onClick={() => { setTab("image"); setModal({ frames: row.visits.map((item) => ({ frameId: item.frameId, durationMs: item.durationMs, clicks: item.clicks })), index: frameIndex }); }} className={`w-36 shrink-0 overflow-hidden rounded-md border text-left ${visit.frameId === goalFrameId ? "border-emerald-500 ring-1 ring-emerald-300" : "border-line"} ${!screenshot ? "cursor-not-allowed" : ""}`}>
              {screenshot ? <><img src={`/api/stimuli/${screenshot.assetId}`} alt={screenshot.frameName} className="h-24 w-full object-cover" /></> : <div className="flex h-24 items-center justify-center bg-background px-2 text-center text-[10px] text-muted">Approved screenshot missing</div>}
              <span className="block truncate px-2 pt-1 text-xs font-medium">{screenshot?.frameName ?? visit.frameId}</span><span className="block px-2 pb-1 text-[10px] text-muted">{formatSeconds(visit.durationMs)} · {visit.clicks.length} clicks</span>
            </button>;
          })}
        </div>
      </article>;
    })}
    {renameStatus && <p role={renameStatus.error ? "alert" : "status"} className={`text-xs ${renameStatus.error ? "text-rose-700" : "text-muted"}`}>{renameStatus.message}</p>}
    {rows.length > 10 && <button type="button" className="rounded-md border border-line px-3 py-1.5 text-xs" onClick={() => setExpanded((value) => !value)}>{expanded ? "Show top 10" : `Expand all ${rows.length}`}</button>}
    {modal && activeFrame && activeScreenshot && <div role="dialog" aria-modal="true" aria-label={`Frame ${activeScreenshot.frameName}`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[95vh] w-full max-w-6xl overflow-hidden rounded-xl bg-surface shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3"><div><strong>{activeScreenshot.frameName}</strong><p className="text-xs text-muted">{formatSeconds(activeFrame.durationMs)} · {activeFrame.clicks.length} clicks · {misclickPercent(activeFrame.clicks.filter((click) => click.isMisclick).length, activeFrame.clicks.length)} % misclicks</p></div><button type="button" className="rounded border border-line px-3 py-1 text-sm" onClick={() => setModal(null)}>Close</button></div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-2 text-xs">{(["image", "heatmap", "clicks"] as const).map((item) => <button type="button" key={item} onClick={() => setTab(item)} className={`rounded px-3 py-1 ${tab === item ? "bg-accent text-white" : "border border-line"}`}>{item}</button>)}<a href={`/api/stimuli/${activeScreenshot.assetId}`} download className="ml-auto rounded border border-line px-3 py-1">Download image</a>{tab === "clicks" && <label>Show <select className="ml-1 rounded border border-line bg-surface px-2 py-1" value={clickScope} onChange={(event) => setClickScope(event.target.value as typeof clickScope)}><option value="all">All clicks</option><option value="misclicks">Misclicks only</option></select></label>}{tab === "heatmap" && <button type="button" className="rounded border border-line px-3 py-1" onClick={() => downloadHeatmap(`/api/stimuli/${activeScreenshot.assetId}`, activeFrame.clicks, activeScreenshot.coordinateScale, activeScreenshot.frameName)}>Download heatmap PNG</button>}</div>
        <div className="max-h-[72vh] overflow-auto bg-slate-900 p-4"><div className="relative mx-auto w-max"><img src={`/api/stimuli/${activeScreenshot.assetId}`} alt={activeScreenshot.frameName} className="max-w-none" />{tab !== "image" && (tab === "clicks" ? visibleClicks : activeFrame.clicks).map((click, index) => <span key={index} title={click.isMisclick ? "Misclick" : "Click"} className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${tab === "heatmap" ? "h-16 w-16 bg-red-500/35 blur-lg" : click.isMisclick ? "h-4 w-4 border-2 border-white bg-rose-600" : "h-4 w-4 border-2 border-white bg-cyan-500"}`} style={{ left: click.x * activeScreenshot.coordinateScale, top: click.y * activeScreenshot.coordinateScale }} />)}</div></div>
        <div className="flex items-center justify-between border-t border-line p-3"><button type="button" disabled={modal.index === 0} onClick={() => setModal({ ...modal, index: modal.index - 1 })}>← Previous</button><span className="text-xs text-muted">Coordinate scale: {activeScreenshot.coordinateScale}×. Overlay requires screenshot coordinates matching Figma frame coordinates.</span><button type="button" disabled={modal.index >= modal.frames.length - 1} onClick={() => setModal({ ...modal, index: modal.index + 1 })}>Next →</button></div>
      </div>
    </div>}
  </div>;
}

function formatSeconds(ms: number): string { return `${(Math.max(0, ms) / 1000).toFixed(1)} s`; }
function misclickPercent(misclicks: number, clicks: number): string { return clicks ? (misclicks / clicks * 100).toFixed(1) : "0.0"; }

async function downloadHeatmap(url: string, clicks: PrototypePath["clicks"], scale: number, name: string) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) return;
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext("2d"); if (!context) return;
  context.drawImage(bitmap, 0, 0);
  for (const click of clicks) {
    const x = click.x * scale; const y = click.y * scale;
    const gradient = context.createRadialGradient(x, y, 0, x, y, 36);
    gradient.addColorStop(0, click.isMisclick ? "rgba(244,63,94,.8)" : "rgba(239,68,68,.75)"); gradient.addColorStop(1, "rgba(239,68,68,0)");
    context.fillStyle = gradient; context.fillRect(x - 36, y - 36, 72, 72);
  }
  canvas.toBlob((blob) => { if (!blob) return; const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${name.replace(/[^a-z0-9_-]+/gi, "-")}-heatmap.png`; link.click(); URL.revokeObjectURL(link.href); }, "image/png");
}
