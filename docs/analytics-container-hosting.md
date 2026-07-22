# Analytics container hosting

Why: on Vercel's Python serverless runtime the analytics function bundles the
full scientific stack (pandas, numpy, scipy, statsmodels, scikit-learn,
pyreadstat) — a ~290 MB bundle whose import cost is paid on every cold start.
A long-lived container imports that stack once at boot and then stays warm, so
requests no longer pay the cold-start penalty. This is decision #6 in the
implementation runbook.

The web app talks to analytics purely over HTTPS via two settings, so moving
hosts is a configuration change — no application code changes:

- `ANALYTICS_URL` — the analytics origin (defaults to `http://127.0.0.1:8000`).
- `ANALYTICS_API_SECRET` — shared bearer token; must match on both sides.

## Build and run locally (verify the image)

```bash
cd apps/analytics
docker build -t ok-cx-analytics:local .
docker run --rm -p 8000:8000 -e ANALYTICS_API_SECRET=dev-secret ok-cx-analytics:local

# in another terminal:
curl -s localhost:8000/health                       # -> {"status":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' localhost:8000/health/details   # -> 401 (no bearer)
curl -s -H "Authorization: Bearer dev-secret" localhost:8000/health/details
```

Point the web app at it with `ANALYTICS_URL=http://127.0.0.1:8000` and the same
`ANALYTICS_API_SECRET`.

## Deploy to a container host

The image is platform-agnostic and reads `$PORT` (Cloud Run injects `8080`; the
image falls back to `8000`). Pick the approved host, then:

1. **Build and push** to a registry the host can pull from:
   ```bash
   docker build -t <registry>/ok-cx-analytics:<tag> apps/analytics
   docker push <registry>/ok-cx-analytics:<tag>
   ```
2. **Run the container** on the host (Cloud Run / Fly.io / Azure Container Apps /
   Railway / ECS). Set one environment variable on the service:
   - `ANALYTICS_API_SECRET` — the environment's random secret (staging and
     production differ; see the runbook).
   Expose it over HTTPS and note the public origin.
3. **Repoint the web app**: in the `ok-cx-web` Vercel project set `ANALYTICS_URL`
   to the container's HTTPS origin and confirm `ANALYTICS_API_SECRET` matches.
   Redeploy web (or just the env change takes effect on next deploy).
4. **Verify** the same five checks the runbook lists for analytics: `/health`
   returns `{"status":"ok"}` without a bearer; `/health/details` is 401 without
   and 200 with the bearer; a small NPS analysis succeeds; a SAV round-trip runs.
5. **Decommission** the Vercel analytics project only after the container has
   served traffic cleanly for a business cycle, so instant rollback stays
   available.

## Image notes

- Python 3.12-slim, matching CI and `.python-version` (the previous Dockerfile
  used 3.11; the scientific wheels differ by minor version).
- Multi-stage: the final image carries only the resolved virtualenv and `src/`,
  not `uv` or build caches; it runs as a non-root user and has a `/health`
  `HEALTHCHECK`.
- Dependencies are reproducible via the frozen `uv.lock`.
