import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { assertFigmaDraftAccess, figmaDraftAccessResponse } from "@/lib/figma-access";
import { FIGMA_ACCESS_COOKIE, FIGMA_ACCESS_COOKIE_PATH, openFigmaToken } from "@/lib/figma-token";
import { classifyFigmaApiError } from "@/lib/figma-api-error";

export async function GET(request: Request) {
  const session = await getSession(); if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const fileKey = url.searchParams.get("fileKey");
  const studyId = url.searchParams.get("studyId");
  const questionCode = url.searchParams.get("questionCode");
  if (!fileKey || !/^[a-zA-Z0-9_-]{1,200}$/.test(fileKey)) return Response.json({ error: "invalid_file_key" }, { status: 400 });
  if (!studyId || !questionCode) return Response.json({ error: "invalid_request" }, { status: 400 });
  try { await assertFigmaDraftAccess(session, studyId, questionCode, fileKey); } catch (error) { return figmaDraftAccessResponse(error); }
  const jar = await cookies();
  const token = openFigmaToken(jar.get(FIGMA_ACCESS_COOKIE)?.value, session);
  if (!token) {
    jar.set(FIGMA_ACCESS_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: FIGMA_ACCESS_COOKIE_PATH, maxAge: 0 });
    return Response.json({ error: "figma_not_connected" }, { status: 401 });
  }
  const response = await fetch(`https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}?depth=2`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) {
    const providerBody = await response.json().catch(() => null) as unknown;
    const error = classifyFigmaApiError(response.status, providerBody);
    const status = response.status === 403 || response.status === 404 || response.status === 429 ? response.status : 502;
    return Response.json({ error }, { status });
  }
  const body = await response.json() as { name?: string; version?: string; document?: { children?: Array<{ children?: Array<{ id?: string; name?: string; type?: string }>; flowStartingPoints?: Array<{ nodeId?: string; name?: string }>; prototypeStartNodeID?: string }> } };
  const frames = (body.document?.children ?? []).flatMap((page) => page.children ?? []).filter((node) => node.type === "FRAME" && node.id && node.name).slice(0, 500).map((node) => ({ id: node.id!, name: node.name! }));
  const flowStartingPoints = (body.document?.children ?? []).flatMap((page) =>
    page.flowStartingPoints?.flatMap((point) => point.nodeId ? [{ id: point.nodeId, name: point.name?.trim() || frames.find((frame) => frame.id === point.nodeId)?.name || `Flow ${point.nodeId}` }] : [])
      ?? (page.prototypeStartNodeID ? [{ id: page.prototypeStartNodeID, name: frames.find((frame) => frame.id === page.prototypeStartNodeID)?.name || `Flow ${page.prototypeStartNodeID}` }] : []),
  ).slice(0, 100);
  return Response.json({ name: body.name ?? "", versionId: body.version ?? "", frames, flowStartingPoints }, { headers: { "cache-control": "private, no-store" } });
}
