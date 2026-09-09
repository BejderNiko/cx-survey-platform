import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { figmaOAuthConfigured } from "@/lib/figma-oauth";
import { FIGMA_ACCESS_COOKIE, FIGMA_ACCESS_COOKIE_PATH, openFigmaToken } from "@/lib/figma-token";

export async function GET() {
  const session = await getSession(); if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const jar = await cookies();
  const envelope = jar.get(FIGMA_ACCESS_COOKIE)?.value;
  const connected = Boolean(openFigmaToken(envelope, session));
  if (envelope && !connected) jar.set(FIGMA_ACCESS_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: FIGMA_ACCESS_COOKIE_PATH, maxAge: 0 });
  return Response.json({ configured: figmaOAuthConfigured(), connected, liveEventVerification: false }, { headers: { "cache-control": "private, no-store" } });
}