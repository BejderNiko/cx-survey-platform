"""Dataset payload -> pandas DataFrame with variable metadata applied."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .contracts import DatasetPayload, VariableMeta


def to_frame(dataset: DatasetPayload) -> tuple[pd.DataFrame, dict[str, VariableMeta]]:
    """Build a DataFrame; user-defined missing values become NaN.

    Numeric variables are coerced with pd.to_numeric (invalid -> NaN) so the
    same exclusion rules apply everywhere.
    """
    meta = {v.name: v for v in dataset.variables}
    df = pd.DataFrame(dataset.rows)
    for name, v in meta.items():
        if name not in df.columns:
            df[name] = np.nan
            continue
        if v.missing_values:
            df[name] = df[name].where(~df[name].isin(v.missing_values), np.nan)
        if v.var_type in ("numeric", "boolean"):
            df[name] = pd.to_numeric(df[name], errors="coerce")
    return df, meta


def label_for(meta: dict[str, VariableMeta], name: str) -> str:
    v = meta.get(name)
    return (v.label if v and v.label else name)


def value_label(meta: dict[str, VariableMeta], name: str, value: object) -> str:
    v = meta.get(name)
    if v and str(value) in v.value_labels:
        return f"{v.value_labels[str(value)]} ({value})"
    return str(value)


def rounded(x: object, digits: int = 6) -> object:
    if isinstance(x, (float, np.floating)):
        if np.isnan(x):
            return None
        return round(float(x), digits)
    if isinstance(x, (np.integer,)):
        return int(x)
    return x
