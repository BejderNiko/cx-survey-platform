import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { FIGMA_ACCESS_COOKIE, FIGMA_ACCESS_COOKIE_PATH } from "@/lib/figma-token";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const jar = await cookies();
  jar.set(FIGMA_ACCESS_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: FIGMA_ACCESS_COOKIE_PATH, maxAge: 0 });
  return Response.json({ disconnected: true }, { headers: { "cache-control": "private, no-store" } });
}
