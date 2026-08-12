import { cookies } from "next/headers";
import { assertCan } from "@ok/domain";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await getSession(); if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  try { assertCan(session.role, "studies.edit"); } catch { return Response.json({ error: "forbidden" }, { status: 403 }); }
  const fileKey = new URL(request.url).searchParams.get("fileKey"); if (!fileKey || !/^[a-zA-Z0-9_-]{1,200}$/.test(fileKey)) return Response.json({ error: "invalid_file_key" }, { status: 400 });
  const token = (await cookies()).get("figma_access")?.value; if (!token) return Response.json({ error: "figma_not_connected" }, { status: 401 });
  const response = await fetch(`https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}?depth=2`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) return Response.json({ error: "figma_file_unavailable" }, { status: response.status === 403 ? 403 : 502 });
  const body = await response.json() as { name?: string; version?: string; document?: { children?: Array<{ children?: Array<{ id?: string; name?: string; type?: string }> }> } };
  const frames = (body.document?.children ?? []).flatMap((page) => page.children ?? []).filter((node) => node.type === "FRAME" && node.id && node.name).slice(0, 500).map((node) => ({ id: node.id!, name: node.name! }));
  return Response.json({ name: body.name ?? "", versionId: body.version ?? "", frames }, { headers: { "cache-control": "private, no-store" } });
}