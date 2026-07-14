const ALLOWED_DOMAINS = ["lyssna.com", "nps.today"];

function isAllowedDomain(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");

  return ALLOWED_DOMAINS.some(
    (domain) =>
      normalized === domain || normalized.endsWith(`.${domain}`)
  );
}

function isAuthorized(request: Request) {
  const expected = process.env.IMPORT_API_SECRET;
  const supplied = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  return Boolean(expected && supplied === expected);
}

function getApiKey() {
  return process.env.FIRECRAWL_API_KEY;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = getApiKey();

  if (!apiKey) {
    return Response.json(
      { error: "FIRECRAWL_API_KEY is missing" },
      { status: 500 }
    );
  }

  let body: { url?: unknown; limit?: unknown };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Valid JSON required" }, { status: 400 });
  }

  if (typeof body.url !== "string") {
    return Response.json({ error: "URL required" }, { status: 400 });
  }

  let target: URL;

  try {
    target = new URL(body.url);
  } catch {
    return Response.json({ error: "Valid URL required" }, { status: 400 });
  }

  if (target.protocol !== "https:" || !isAllowedDomain(target.hostname)) {
    return Response.json(
      { error: "Only Lyssna and nps.today are allowed" },
      { status: 400 }
    );
  }

  const requestedLimit =
    typeof body.limit === "number" ? Math.trunc(body.limit) : 100;

  // Prevent accidental unlimited crawl.
  const limit = Math.min(Math.max(requestedLimit, 1), 250);

  const firecrawlResponse = await fetch(
    "https://api.firecrawl.dev/v2/crawl",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: target.href,
        limit,
        sitemap: "include",
        crawlEntireDomain: true,
        allowExternalLinks: false,
        allowSubdomains: false,
        ignoreQueryParameters: true,

        // One-second spacing. Reduces load on target site.
        delay: 1,

        scrapeOptions: {
          formats: ["markdown"],
          onlyMainContent: true,
          onlyCleanContent: true,
          maxAge: 0,
          storeInCache: false,
        },
      }),
    }
  );

  const result = await firecrawlResponse.json();

  return Response.json(result, {
    status: firecrawlResponse.status,
  });
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = getApiKey();

  if (!apiKey) {
    return Response.json(
      { error: "FIRECRAWL_API_KEY is missing" },
      { status: 500 }
    );
  }

  const requestUrl = new URL(request.url);
  const id = requestUrl.searchParams.get("id");

  if (!id || !/^[a-zA-Z0-9_-]{8,100}$/.test(id)) {
    return Response.json({ error: "Valid crawl ID required" }, { status: 400 });
  }

  const firecrawlResponse = await fetch(
    `https://api.firecrawl.dev/v2/crawl/${encodeURIComponent(id)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    }
  );

  const result = await firecrawlResponse.json();

  return Response.json(result, {
    status: firecrawlResponse.status,
  });
}