import { pathSignature } from "./results-filters";

export interface PrototypeInteractionRow {
  responseId: string;
  questionCode: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface PrototypeClick {
  frameId: string;
  x: number;
  y: number;
  isMisclick: boolean;
  elapsedMs: number;
}

export interface PrototypeFrameVisit {
  frameId: string;
  enteredAtMs: number;
  durationMs: number;
  clicks: PrototypeClick[];
}

export interface PrototypePath {
  responseId: string;
  frames: string[];
  visits: PrototypeFrameVisit[];
  signature: string;
  clicks: PrototypeClick[];
  elapsedMs: number;
}

export interface CommonPrototypePath {
  signature: string;
  frames: string[];
  participantCount: number;
  responseIds: string[];
  clickCount: number;
  misclickCount: number;
  averageElapsedMs: number;
  averageVisits: PrototypeFrameVisit[];
}

export function buildPrototypePaths(rows: PrototypeInteractionRow[], questionCode: string): PrototypePath[] {
  const byResponse = new Map<string, PrototypeInteractionRow[]>();
  for (const row of rows) {
    if (row.questionCode !== questionCode) continue;
    byResponse.set(row.responseId, [...(byResponse.get(row.responseId) ?? []), row]);
  }
  return [...byResponse.entries()].map(([responseId, events]) => {
    const visits: PrototypeFrameVisit[] = [];
    const clicks: PrototypeClick[] = [];
    let lastFrameId = "";
    let elapsedMs = 0;
    for (const event of events) {
      const currentElapsed = finiteNonNegative(event.payload.elapsedMs);
      elapsedMs = Math.max(elapsedMs, currentElapsed);
      if (event.eventType === "prototype_frame") {
        const frameId = String(event.payload.frameId ?? "");
        if (!frameId || frameId === lastFrameId) continue;
        const previous = visits.at(-1);
        if (previous) previous.durationMs = Math.max(0, currentElapsed - previous.enteredAtMs);
        visits.push({ frameId, enteredAtMs: currentElapsed, durationMs: 0, clicks: [] });
        lastFrameId = frameId;
      }
      if (event.eventType === "prototype_click") {
        const click = {
          frameId: String(event.payload.frameId ?? ""),
          x: Number(event.payload.x),
          y: Number(event.payload.y),
          isMisclick: event.payload.isMisclick === true,
          elapsedMs: currentElapsed,
        };
        if (click.frameId && Number.isFinite(click.x) && Number.isFinite(click.y)) clicks.push(click);
      }
    }
    const last = visits.at(-1);
    if (last) last.durationMs = Math.max(0, elapsedMs - last.enteredAtMs);
    for (const visit of visits) {
      const nextEntered = visits[visits.indexOf(visit) + 1]?.enteredAtMs ?? Number.POSITIVE_INFINITY;
      visit.clicks = clicks.filter((click) => click.frameId === visit.frameId && click.elapsedMs >= visit.enteredAtMs && click.elapsedMs < nextEntered);
    }
    const frames = visits.map((visit) => visit.frameId);
    return { responseId, frames, visits, signature: pathSignature(frames), clicks, elapsedMs };
  });
}

export function groupCommonPaths(paths: PrototypePath[]): CommonPrototypePath[] {
  const groups = new Map<string, PrototypePath[]>();
  for (const path of paths) groups.set(path.signature, [...(groups.get(path.signature) ?? []), path]);
  return [...groups.entries()].map(([signature, matches]) => {
    const clicks = matches.flatMap((path) => path.clicks);
    const representative = matches[0]?.visits ?? [];
    const averageVisits = representative.map((visit, index) => ({
      frameId: visit.frameId,
      enteredAtMs: Math.round(matches.reduce((sum, path) => sum + (path.visits[index]?.enteredAtMs ?? 0), 0) / matches.length),
      durationMs: Math.round(matches.reduce((sum, path) => sum + (path.visits[index]?.durationMs ?? 0), 0) / matches.length),
      clicks: matches.flatMap((path) => path.visits[index]?.clicks ?? []),
    }));
    return {
      signature,
      frames: matches[0]?.frames ?? [],
      participantCount: matches.length,
      responseIds: matches.map((path) => path.responseId),
      clickCount: clicks.length,
      misclickCount: clicks.filter((click) => click.isMisclick).length,
      averageElapsedMs: matches.length ? Math.round(matches.reduce((sum, path) => sum + path.elapsedMs, 0) / matches.length) : 0,
      averageVisits,
    };
  }).sort((left, right) => right.participantCount - left.participantCount || left.signature.localeCompare(right.signature));
}

function finiteNonNegative(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}
