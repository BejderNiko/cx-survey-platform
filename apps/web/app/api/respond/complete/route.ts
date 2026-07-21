import { z } from "zod";
import { completeResponse } from "@/lib/data/respondent";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  responseId: z.uuid(),
  token: z.string().min(4).max(120),
  status: z.enum(["completed", "disqualified"]),
  answers: z
    .array(z.object({ code: z.string().max(64), type: z.string().max(32), value: z.unknown() }))
    .max(200),
  interactions: z
    .array(
      z.object({
        code: z.string().max(64),
        eventType: z.string().max(32),
        payload: z.record(z.string(), z.unknown()),
      }),
    )
    .max(50)
    .default([]),
});

const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  if (!rateLimit(`complete:${clientKey(request)}`, 30)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  const declaredBytes = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_BODY_BYTES) {
    return Response.json({ error: "request_too_large" }, { status: 413 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return Response.json({ error: "request_too_large" }, { status: 413 });
    }
    body = bodySchema.parse(JSON.parse(raw));
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const result = await completeResponse(body);
  if (!result.ok) return Response.json(result, { status: 409 });
  return Response.json(result);
}
