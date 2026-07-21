"""Root-level ASGI entrypoint for Vercel's Python runtime.

Vercel's entrypoint resolution expects a file at the project root (its
example is "main:app"); the package lives under src/ (PEP 517 src layout).
Vercel's Python build installs the declared dependencies but does not run
`pip install .` on this project itself, so "ok_analytics" is never placed
on sys.path as an importable top-level package — only the raw src/ tree is
copied into the deployment. Prepending src/ here makes the import work
regardless of whether the local package ever gets properly installed.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from ok_analytics.main import app  # noqa: E402, F401
