# syntax=docker/dockerfile:1
#
# Container image for the OK analytics service (FastAPI + pandas/scipy/
# statsmodels/scikit-learn/pyreadstat). A long-lived container keeps the heavy
# scientific stack imported and warm, so it removes the per-invocation cold
# start that the Vercel Python serverless runtime pays every time a new lambda
# spins up — the main source of slow analytics responses. Build once, run on
# any OCI host (Cloud Run, Fly.io, Azure Container Apps, Railway, ECS, …).

# ---- build stage: resolve + install deps and the project with uv ----
FROM python:3.12-slim AS build
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0
# uv is pinned to :latest here; the dependency set itself is fully reproducible
# because uv.lock is frozen. Pin to a reviewed uv tag during production hardening.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
# Install third-party dependencies first so this layer caches across code edits,
# then install the project itself once src/ is present.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev
COPY src ./src
RUN uv sync --frozen --no-dev

# ---- runtime stage: slim image, no build tooling, non-root ----
FROM python:3.12-slim AS runtime
WORKDIR /app
# The venv's bin on PATH lets us launch uvicorn directly without uv at runtime.
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000
RUN useradd --system --uid 10001 --create-home appuser
COPY --from=build --chown=appuser:appuser /app/.venv /app/.venv
COPY --from=build --chown=appuser:appuser /app/src /app/src
USER appuser
EXPOSE 8000
# /health needs no credentials and returns {"status":"ok"} (see src/.../main.py).
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD ["python", "-c", "import os,sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/health',timeout=4).status==200 else 1)"]
# Container platforms inject $PORT (Cloud Run uses 8080); fall back to 8000 locally.
CMD ["sh", "-c", "exec uvicorn ok_analytics.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
