import { z } from "zod";
import { startResponse } from "@/lib/data/respondent";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  token: z.string().min(4).max(120),
  language: z.enum(["da", "en"]).default("da"),
  viewport: z.string().max(20).default("desktop"),
});

export async function POST(request: Request) {
  if (!rateLimit(`start:${clientKey(request)}`, 30)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const result = await startResponse(body);
  if ("error" in result) {
    return Response.json(result, { status: result.error === "unknown_token" ? 404 : 409 });
  }
  return Response.json(result);
}
