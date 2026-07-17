"""Typed contracts between the web app and the analytics service.

Every analysis result carries the full statistical contract: method and
library procedure, sample sizes, exclusions, missing-data strategy,
assumptions, estimates with uncertainty, test statistics with degrees of
freedom and p-values, and the exact library versions used.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class VariableMeta(BaseModel):
    name: str
    label: str = ""
    var_type: str = "numeric"  # numeric | string | date | boolean
    measure: str = "nominal"   # nominal | ordinal | scale
    value_labels: dict[str, str] = Field(default_factory=dict)
    missing_values: list[Any] = Field(default_factory=list)


class DatasetPayload(BaseModel):
    variables: list[VariableMeta]
    rows: list[dict[str, Any]]


class AnalysisRequest(BaseModel):
    procedure: str
    params: dict[str, Any] = Field(default_factory=dict)
    seed: int | None = None
    dataset: DatasetPayload


class TableOut(BaseModel):
    title: str
    columns: list[str]
    rows: list[list[Any]]


class AnalysisResult(BaseModel):
    procedure: str
    method: str
    library_versions: dict[str, str]
    n_total: int
    n_used: int
    n_excluded: int
    missing_strategy: str
    assumptions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    tables: list[TableOut] = Field(default_factory=list)
    chart: dict[str, Any] | None = None  # plotly-compatible {data, layout}
    interpretation: str = ""
    seed: int | None = None


class ExportRequest(BaseModel):
    format: str  # csv | xlsx | json | sav
    dataset: DatasetPayload
    filename: str = "dataset"
