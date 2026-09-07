import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { assertFigmaDraftAccess, FigmaDraftAccessError, figmaDraftAccessResponse } from "@/lib/figma-access";
import { exchangeFigmaCode, verifyFigmaState } from "@/lib/figma-oauth";
import { FIGMA_ACCESS_COOKIE, FIGMA_ACCESS_COOKIE_PATH, sealFigmaToken } from "@/lib/figma-token";

export async function GET(request: Request) {
  const session = await getSession(); if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url); const code = url.searchParams.get("code"); const state = url.searchParams.get("state");
  if (!code || !state) return Response.json({ error: "invalid_callback" }, { status: 400 });
  try {
    const verified = await verifyFigmaState(state);
    if (verified.userId !== session.userId || verified.orgId !== session.orgId) return Response.json({ error: "invalid_state" }, { status: 403 });
    await assertFigmaDraftAccess(session, verified.studyId, verified.questionCode);
    const token = await exchangeFigmaCode(code, verified.verifier);
    const lifetime = Math.min(token.expires_in, 3_600);
    const envelope = sealFigmaToken(session, token.access_token, lifetime);
    const jar = await cookies(); jar.set(FIGMA_ACCESS_COOKIE, envelope, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: FIGMA_ACCESS_COOKIE_PATH, maxAge: lifetime });
    return Response.redirect(new URL(`/studies/${verified.studyId}/builder?figma=connected&question=${encodeURIComponent(verified.questionCode)}`, request.url), 302);
  } catch (error) {
    if (error instanceof FigmaDraftAccessError) return figmaDraftAccessResponse(error);
    return Response.json({ error: "figma_oauth_failed" }, { status: 400 });
  }
}
