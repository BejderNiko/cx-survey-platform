const ALLOWED_DOMAINS = ["lyssna.com", "preely.com", "nps.today"];

export const runtime = "nodejs";
export const maxDuration = 60;

function isAllowedDomain(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");

  return ALLOWED_DOMAINS.some(
    (domain) =>
      normalized === domain || normalized.endsWith(`.${domain}`)
  );
}

export async function POST(request: Request) {
  const expectedSecret = process.env.IMPORT_API_SECRET;
  const suppliedSecret = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.FIRECRAWL_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "FIRECRAWL_API_KEY is missing" },
      { status: 500 }
    );
  }

  let target: URL;

  try {
    const body = await request.json();
    target = new URL(body.url);
  } catch {
    return Response.json({ error: "Valid URL required" }, { status: 400 });
  }

  if (target.protocol !== "https:" || !isAllowedDomain(target.hostname)) {
    return Response.json(
      { error: "Only approved HTTPS domains are allowed" },
      { status: 400 }
    );
  }

  const firecrawlResponse = await fetch(
    "https://api.firecrawl.dev/v2/scrape",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: target.href,
        formats: ["markdown", "links"],
        onlyMainContent: true,
        onlyCleanContent: true,
        timeout: 50_000,

        // Better defaults when survey content may contain personal data:
        maxAge: 0,
        storeInCache: false,
      }),
      signal: AbortSignal.timeout(55_000),
    }
  );

  const result = await firecrawlResponse.json();

  if (!firecrawlResponse.ok || !result.success) {
    return Response.json(
      {
        error: "Firecrawl request failed",
        details: result,
      },
      { status: firecrawlResponse.status || 502 }
    );
  }

  return Response.json({
    markdown: result.data?.markdown ?? "",
    links: result.data?.links ?? [],
    metadata: result.data?.metadata ?? {},
  });
}