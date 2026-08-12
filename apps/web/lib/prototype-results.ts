import { pathSignature } from "./results-filters";

export interface PrototypeInteractionRow {
  responseId: string;
  questionCode: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface PrototypePath {
  responseId: string;
  frames: string[];
  signature: string;
  clicks: { frameId: string; x: number; y: number; isMisclick: boolean; elapsedMs: number }[];
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
}

export function buildPrototypePaths(rows: PrototypeInteractionRow[], questionCode: string): PrototypePath[] {
  const byResponse = new Map<string, PrototypeInteractionRow[]>();
  for (const row of rows) {
    if (row.questionCode !== questionCode) continue;
    byResponse.set(row.responseId, [...(byResponse.get(row.responseId) ?? []), row]);
  }
  return [...byResponse.entries()].map(([responseId, events]) => {
    const frames = events
      .filter((event) => event.eventType === "prototype_frame")
      .map((event) => String(event.payload.frameId ?? ""))
      .filter((frameId, index, all) => Boolean(frameId) && (index === 0 || frameId !== all[index - 1]));
    const clicks = events
      .filter((event) => event.eventType === "prototype_click")
      .map((event) => ({
        frameId: String(event.payload.frameId ?? ""),
        x: Number(event.payload.x),
        y: Number(event.payload.y),
        isMisclick: event.payload.isMisclick === true,
        elapsedMs: Number(event.payload.elapsedMs),
      }))
      .filter((click) => click.frameId && Number.isFinite(click.x) && Number.isFinite(click.y) && Number.isFinite(click.elapsedMs));
    const elapsedMs = Math.max(0, ...events.map((event) => Number(event.payload.elapsedMs)).filter(Number.isFinite));
    return { responseId, frames, signature: pathSignature(frames), clicks, elapsedMs };
  });
}

export function groupCommonPaths(paths: PrototypePath[]): CommonPrototypePath[] {
  const groups = new Map<string, PrototypePath[]>();
  for (const path of paths) groups.set(path.signature, [...(groups.get(path.signature) ?? []), path]);
  return [...groups.entries()].map(([signature, matches]) => {
    const clicks = matches.flatMap((path) => path.clicks);
    return {
      signature,
      frames: matches[0]?.frames ?? [],
      participantCount: matches.length,
      responseIds: matches.map((path) => path.responseId),
      clickCount: clicks.length,
      misclickCount: clicks.filter((click) => click.isMisclick).length,
      averageElapsedMs: matches.length ? Math.round(matches.reduce((sum, path) => sum + path.elapsedMs, 0) / matches.length) : 0,
    };
  }).sort((left, right) => right.participantCount - left.participantCount || left.signature.localeCompare(right.signature));
}
