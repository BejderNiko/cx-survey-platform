"""Dataset exports (CSV, XLSX, JSON, SPSS .sav) and .sav import.

All exports preserve variable labels/value labels where the format supports
them; CSV/XLSX exports are protected against formula injection.
"""
from __future__ import annotations

import csv
import io
import json
import tempfile
from pathlib import Path

import pandas as pd
import pyreadstat

from .contracts import DatasetPayload, VariableMeta
from .frame import to_frame

FORMULA_PREFIXES = ("=", "+", "-", "@", "\t")


def _sanitize_cell(value: object) -> object:
    if isinstance(value, str) and value.startswith(FORMULA_PREFIXES):
        return "'" + value
    return value


def export_csv(dataset: DatasetPayload) -> bytes:
    df, _ = to_frame(dataset)
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(df.columns.tolist())
    for _, row in df.iterrows():
        writer.writerow([_sanitize_cell("" if pd.isna(v) else v) for v in row])
    return ("﻿" + out.getvalue()).encode("utf-8")


def export_json(dataset: DatasetPayload) -> bytes:
    payload = {
        "variables": [v.model_dump() for v in dataset.variables],
        "rows": dataset.rows,
    }
    return json.dumps(payload, ensure_ascii=False, indent=1, default=str).encode("utf-8")


def export_xlsx(dataset: DatasetPayload) -> bytes:
    from openpyxl import Workbook

    df, meta = to_frame(dataset)
    wb = Workbook()
    ws = wb.active
    ws.title = "data"
    ws.append(df.columns.tolist())
    for _, row in df.iterrows():
        ws.append([_sanitize_cell(None if pd.isna(v) else v) for v in row])
    codebook = wb.create_sheet("codebook")
    codebook.append(["variable", "label", "type", "measure", "value_labels", "missing_values"])
    for v in dataset.variables:
        codebook.append([v.name, v.label, v.var_type, v.measure,
                         json.dumps(v.value_labels, ensure_ascii=False), json.dumps(v.missing_values, default=str)])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def export_sav(dataset: DatasetPayload) -> bytes:
    df, meta = to_frame(dataset)
    # pyreadstat needs consistent dtypes; keep numerics numeric, rest as string.
    sav_df = df.copy()
    column_labels = []
    variable_value_labels: dict[str, dict] = {}
    for v in dataset.variables:
        if v.name not in sav_df.columns:
            continue
        column_labels.append(v.label or v.name)
        if v.var_type not in ("numeric", "boolean"):
            sav_df[v.name] = sav_df[v.name].astype(object).where(sav_df[v.name].notna(), None)
            sav_df[v.name] = sav_df[v.name].apply(lambda x: str(x) if x is not None else None)
        if v.value_labels:
            if v.var_type in ("numeric", "boolean"):
                labels = {}
                for key, lab in v.value_labels.items():
                    try:
                        labels[float(key)] = lab
                    except ValueError:
                        continue
                if labels:
                    variable_value_labels[v.name] = labels
            else:
                variable_value_labels[v.name] = dict(v.value_labels)
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "dataset.sav"
        pyreadstat.write_sav(
            sav_df,
            str(path),
            column_labels=column_labels or None,
            variable_value_labels=variable_value_labels or None,
        )
        return path.read_bytes()


def import_sav(data: bytes) -> DatasetPayload:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "in.sav"
        path.write_bytes(data)
        df, meta = pyreadstat.read_sav(str(path))
    variables = []
    for i, name in enumerate(df.columns):
        value_labels = meta.variable_value_labels.get(name, {})
        variables.append(VariableMeta(
            name=name,
            label=(meta.column_labels[i] if meta.column_labels and meta.column_labels[i] else name),
            var_type="numeric" if pd.api.types.is_numeric_dtype(df[name]) else "string",
            measure=meta.variable_measure.get(name, "nominal") if hasattr(meta, "variable_measure") else "nominal",
            value_labels={str(k): str(v) for k, v in value_labels.items()},
        ))
    rows = json.loads(df.where(pd.notna(df), None).to_json(orient="records"))
    return DatasetPayload(variables=variables, rows=rows)


EXPORTERS = {
    "csv": (export_csv, "text/csv; charset=utf-8", "csv"),
    "json": (export_json, "application/json", "json"),
    "xlsx": (export_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
    "sav": (export_sav, "application/octet-stream", "sav"),
}
