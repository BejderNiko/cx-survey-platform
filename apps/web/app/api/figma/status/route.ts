import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { figmaOAuthConfigured } from "@/lib/figma-oauth";
export async function GET() {
  const session = await getSession(); if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ configured: figmaOAuthConfigured(), connected: Boolean((await cookies()).get("figma_access")?.value), liveEventVerification: false }, { headers: { "cache-control": "private, no-store" } });
}