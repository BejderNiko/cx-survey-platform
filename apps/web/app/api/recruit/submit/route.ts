import { z } from "zod";
import { submitRecruitment } from "@/lib/data/recruitment";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  token: z.string().min(4).max(120),
  firstName: z.string().min(1).max(120),
  email: z.string().max(255),
  answers: z.record(z.string(), z.unknown()).default({}),
});

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request) {
  if (!rateLimit(`recruit:${clientKey(request)}`, 20)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
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
  const result = await submitRecruitment(body);
  if (!result.ok) {
    return Response.json(result, { status: result.error === "unknown_token" ? 404 : 422 });
  }
  return Response.json(result);
}
