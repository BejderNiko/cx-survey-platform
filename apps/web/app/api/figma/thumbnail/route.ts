import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { assertFigmaDraftAccess, figmaDraftAccessResponse } from "@/lib/figma-access";
import { FIGMA_ACCESS_COOKIE, FIGMA_ACCESS_COOKIE_PATH, openFigmaToken } from "@/lib/figma-token";
import { classifyFigmaApiError } from "@/lib/figma-api-error";

const FILE_KEY = /^[a-zA-Z0-9_-]{1,200}$/;
const FRAME_ID = /^\d+:\d+$/;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const fileKey = url.searchParams.get("fileKey");
  const frameId = url.searchParams.get("frameId");
  const studyId = url.searchParams.get("studyId");
  const questionCode = url.searchParams.get("questionCode");
  if (!fileKey || !FILE_KEY.test(fileKey) || !frameId || !FRAME_ID.test(frameId) || !studyId || !questionCode) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    await assertFigmaDraftAccess(session, studyId, questionCode, fileKey);
  } catch (error) {
    return figmaDraftAccessResponse(error);
  }
  const jar = await cookies();
  const token = openFigmaToken(jar.get(FIGMA_ACCESS_COOKIE)?.value, session);
  if (!token) {
    jar.set(FIGMA_ACCESS_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: FIGMA_ACCESS_COOKIE_PATH, maxAge: 0 });
    return Response.json({ error: "figma_not_connected" }, { status: 401 });
  }
  const endpoint = new URL(`https://api.figma.com/v1/images/${encodeURIComponent(fileKey)}`);
  endpoint.searchParams.set("ids", frameId);
  endpoint.searchParams.set("format", "png");
  endpoint.searchParams.set("scale", "0.5");
  const response = await fetch(endpoint, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) {
    const providerBody = await response.json().catch(() => null) as unknown;
    const error = classifyFigmaApiError(response.status, providerBody);
    const status = response.status === 403 || response.status === 404 || response.status === 429 ? response.status : 502;
    return Response.json({ error }, { status });
  }
  const body = await response.json() as { err?: string | null; images?: Record<string, string | null> };
  const imageUrl = body.images?.[frameId];
  if (!imageUrl) return Response.json({ error: "figma_thumbnail_missing" }, { status: 404 });
  return Response.json({ frameId, imageUrl }, { headers: { "cache-control": "private, no-store" } });
}