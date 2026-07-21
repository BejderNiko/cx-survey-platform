"""Root-level ASGI entrypoint for Vercel's Python runtime.

Vercel's entrypoint resolution expects a file at the project root (its
example is "main:app"); the package lives under src/ (PEP 517 src layout),
so a bare "ok_analytics.main:app" entrypoint cannot be found on disk before
the package is installed. This shim re-exports the real app once installed.
"""
from ok_analytics.main import app  # noqa: F401
