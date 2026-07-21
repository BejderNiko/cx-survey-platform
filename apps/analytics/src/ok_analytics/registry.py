"""Procedure registry: name -> callable(df, meta, params[, seed])."""
from __future__ import annotations

from typing import Any, Callable

import pandas as pd

from .contracts import AnalysisResult
from . import procedures_basic as basic
from . import procedures_inferential as infer

SIMPLE: dict[str, Callable[..., AnalysisResult]] = {
    "frequencies": basic.frequencies,
    "descriptives": basic.descriptives,
    "missingness": basic.missingness,
    "crosstab": basic.crosstab,
    "correlation": basic.correlation,
    "nps": basic.nps,
    "csat": basic.csat,
    "ces": basic.ces,
    "trend": basic.trend,
    "ttest_ind": infer.ttest_ind,
    "ttest_rel": infer.ttest_rel,
    "anova": infer.anova,
    "mannwhitney": infer.mannwhitney,
    "kruskal": infer.kruskal,
    "wilcoxon": infer.wilcoxon,
    "linear_regression": infer.linear_regression,
    "logistic_regression": infer.logistic_regression,
    "cronbach_alpha": infer.cronbach_alpha,
}

SEEDED: dict[str, Callable[..., AnalysisResult]] = {
    "bootstrap": infer.bootstrap,
    "kmeans": infer.kmeans,
    "factor": infer.factor,
}

PROCEDURES = sorted([*SIMPLE.keys(), *SEEDED.keys()])


def run_procedure(
    procedure: str,
    df: pd.DataFrame,
    meta: dict[str, Any],
    params: dict[str, Any],
    seed: int | None,
) -> AnalysisResult:
    if procedure in SIMPLE:
        return SIMPLE[procedure](df, meta, params)
    if procedure in SEEDED:
        return SEEDED[procedure](df, meta, params, seed)
    raise ValueError(f"Unknown procedure '{procedure}'. Available: {', '.join(PROCEDURES)}")
