export type ParsedFigmaPrototypeUrl = {
  fileKey: string;
  prototypeName?: string;
  nodeId?: string;
};

const FIGMA_HOSTS = new Set(["figma.com", "www.figma.com", "embed.figma.com"]);
const FILE_KEY = /^[a-zA-Z0-9_-]{1,200}$/;
const FRAME_ID = /^\d+(?::|-)\d+$/;

export function parseFigmaPrototypeUrl(input: string): ParsedFigmaPrototypeUrl | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !FIGMA_HOSTS.has(url.hostname.toLowerCase())) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] !== "proto" || !FILE_KEY.test(segments[1] ?? "")) return null;
  const rawNodeId = url.searchParams.get("node-id")?.trim();
  const nodeId = rawNodeId && FRAME_ID.test(rawNodeId) ? rawNodeId.replace("-", ":") : undefined;
  const rawName = segments[2];
  let prototypeName: string | undefined;
  if (rawName) {
    try {
      prototypeName = decodeURIComponent(rawName).replaceAll("-", " ").trim().slice(0, 200) || undefined;
    } catch {
      prototypeName = undefined;
    }
  }
  return { fileKey: segments[1], prototypeName, nodeId };
}