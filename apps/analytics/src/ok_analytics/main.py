"""FastAPI app: typed analysis and export endpoints for the web app.

Internal service: exposed only to the web backend (localhost in development).
It is stateless — datasets come in with each request; persistence of runs,
recipes, and versions lives in PostgreSQL on the web side.
"""
from __future__ import annotations

import io
import os
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException, Response, UploadFile

from .contracts import AnalysisRequest, AnalysisResult, ExportRequest
from .exports import EXPORTERS, import_sav
from .frame import to_frame
from .registry import PROCEDURES, run_procedure
from .versions import library_versions

app = FastAPI(title="OK Analytics", version="0.1.0")

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
PROTECTED_ENVIRONMENTS = {"staging", "production"}


def require_internal(authorization: str | None = Header(default=None)) -> None:
    """Require a shared bearer secret outside local development."""
    expected = os.getenv("ANALYTICS_API_SECRET", "")
    app_environment = os.getenv("APP_ENV", "development").lower()
    if not expected:
        if app_environment in PROTECTED_ENVIRONMENTS:
            raise HTTPException(status_code=503, detail="Analytics authentication is not configured.")
        return
    supplied = authorization.removeprefix("Bearer ") if authorization else ""
    if not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Unauthorized.")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/health/details", dependencies=[Depends(require_internal)])
def health_details() -> dict:
    return {"status": "ok", "procedures": PROCEDURES, "library_versions": library_versions()}


@app.post("/analyses/run", dependencies=[Depends(require_internal)])
def analyses_run(request: AnalysisRequest) -> AnalysisResult:
    df, meta = to_frame(request.dataset)
    try:
        return run_procedure(request.procedure, df, meta, request.params, request.seed)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/exports", dependencies=[Depends(require_internal)])
def exports(request: ExportRequest) -> Response:
    if request.format not in EXPORTERS:
        raise HTTPException(status_code=422, detail=f"Unsupported format '{request.format}'.")
    exporter, media_type, ext = EXPORTERS[request.format]
    try:
        payload = exporter(request.dataset)
    except Exception as exc:  # surfaced to the caller with context
        raise HTTPException(status_code=500, detail=f"Export failed: {exc}") from exc
    safe_name = "".join(c for c in request.filename if c.isalnum() or c in "-_ ")[:80] or "dataset"
    return Response(
        content=payload,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.{ext}"'},
    )


@app.post("/imports/sav", dependencies=[Depends(require_internal)])
async def imports_sav(file: UploadFile) -> dict:
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 20 MB import limit.")
    try:
        dataset = import_sav(data)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read .sav file: {exc}") from exc
    return dataset.model_dump()
