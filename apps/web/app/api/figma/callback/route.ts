import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { exchangeFigmaCode, verifyFigmaState } from "@/lib/figma-oauth";

export async function GET(request: Request) {
  const session = await getSession(); if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url); const code = url.searchParams.get("code"); const state = url.searchParams.get("state");
  if (!code || !state) return Response.json({ error: "invalid_callback" }, { status: 400 });
  try {
    const verified = await verifyFigmaState(state);
    if (verified.userId !== session.userId || verified.orgId !== session.orgId) return Response.json({ error: "invalid_state" }, { status: 403 });
    const token = await exchangeFigmaCode(code, verified.verifier);
    const jar = await cookies(); jar.set("figma_access", token.access_token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/figma", maxAge: Math.min(token.expires_in, 3600) });
    return Response.redirect(new URL(`/studies/${verified.studyId}/builder?figma=connected&question=${encodeURIComponent(verified.questionCode)}`, request.url), 302);
  } catch { return Response.json({ error: "figma_oauth_failed" }, { status: 400 }); }
}