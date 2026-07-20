"""Descriptive procedures: frequencies, descriptives, missingness, crosstab,
correlation, CX metrics (NPS/CSAT/CES), and time trend with a basic forecast."""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

from .contracts import AnalysisResult, TableOut
from .frame import label_for, rounded, value_label
from .versions import library_versions


def _base(procedure: str, method: str, n_total: int, n_used: int, missing: str) -> dict[str, Any]:
    return {
        "procedure": procedure,
        "method": method,
        "library_versions": library_versions(),
        "n_total": n_total,
        "n_used": n_used,
        "n_excluded": n_total - n_used,
        "missing_strategy": missing,
    }


def frequencies(df: pd.DataFrame, meta, params) -> AnalysisResult:
    var = params["variable"]
    s = df[var]
    n_total = len(s)
    valid = s.dropna()
    counts = valid.value_counts().sort_index()
    cum = 0.0
    rows = []
    for value, count in counts.items():
        pct = count / n_total * 100
        vpct = count / len(valid) * 100 if len(valid) else 0
        cum += vpct
        rows.append([value_label(meta, var, value), int(count), rounded(pct, 1), rounded(vpct, 1), rounded(cum, 1)])
    rows.append(["(missing)", int(n_total - len(valid)), rounded((n_total - len(valid)) / n_total * 100 if n_total else 0, 1), None, None])
    return AnalysisResult(
        **_base("frequencies", "Frequency table (pandas value_counts)", n_total, len(valid),
                "Missing values excluded from valid/cumulative percent; reported separately."),
        tables=[TableOut(title=f"Frequencies — {label_for(meta, var)}",
                         columns=["Value", "Count", "% of total", "Valid %", "Cumulative %"], rows=rows)],
        chart={
            "data": [{"type": "bar", "x": [str(value_label(meta, var, v)) for v in counts.index], "y": [int(c) for c in counts.values]}],
            "layout": {"title": label_for(meta, var), "yaxis": {"title": "Count"}},
        },
        interpretation="Distribution of a single variable. Says nothing about relationships or causes.",
    )


def descriptives(df: pd.DataFrame, meta, params) -> AnalysisResult:
    variables = params["variables"]
    weight = params.get("weight")
    rows = []
    warnings: list[str] = []
    for var in variables:
        s = pd.to_numeric(df[var], errors="coerce")
        valid = s.dropna()
        n = len(valid)
        if n == 0:
            rows.append([label_for(meta, var), 0, len(s)] + [None] * 10)
            continue
        if weight:
            w = pd.to_numeric(df[weight], errors="coerce")
            mask = valid.index.intersection(w.dropna().index)
            wv, xv = w.loc[mask], s.loc[mask]
            mean = float(np.average(xv, weights=wv))
            warnings.append(f"{var}: weighted mean uses weight variable '{weight}' (n={len(mask)}).")
        else:
            mean = float(valid.mean())
        se = float(valid.std(ddof=1) / np.sqrt(n)) if n > 1 else np.nan
        ci = stats.t.interval(0.95, n - 1, loc=float(valid.mean()), scale=se) if n > 1 and se > 0 else (np.nan, np.nan)
        mode = valid.mode()
        rows.append([
            label_for(meta, var), n, int(s.isna().sum()),
            rounded(mean), rounded(float(valid.median())),
            rounded(float(mode.iloc[0])) if len(mode) else None,
            rounded(float(valid.std(ddof=1))) if n > 1 else None,
            rounded(float(valid.var(ddof=1))) if n > 1 else None,
            rounded(float(valid.min())), rounded(float(valid.max())),
            rounded(float(valid.quantile(0.25))), rounded(float(valid.quantile(0.75))),
            f"[{rounded(ci[0])}, {rounded(ci[1])}]" if not np.isnan(ci[0]) else None,
        ])
    return AnalysisResult(
        **_base("descriptives", "Descriptive statistics (pandas/scipy; 95% CI via t-distribution)",
                len(df), int(max((len(pd.to_numeric(df[v], errors='coerce').dropna()) for v in variables), default=0)),
                "Listwise per variable: non-numeric and user-missing values excluded."),
        warnings=warnings,
        tables=[TableOut(
            title="Descriptive statistics",
            columns=["Variable", "N", "Missing", "Mean", "Median", "Mode", "SD", "Variance", "Min", "Max", "Q1", "Q3", "95% CI (mean)"],
            rows=rows)],
        interpretation="Point estimates with uncertainty for scale variables. CIs assume approximately normal sampling distribution of the mean.",
    )


def missingness(df: pd.DataFrame, meta, params) -> AnalysisResult:
    rows = []
    for col in df.columns:
        miss = int(df[col].isna().sum())
        rows.append([label_for(meta, col), len(df), miss, rounded(miss / len(df) * 100 if len(df) else 0, 1)])
    rows.sort(key=lambda r: -r[2])
    return AnalysisResult(
        **_base("missingness", "Per-variable missing-data summary", len(df), len(df), "None (this is the missingness report)."),
        tables=[TableOut(title="Missing data by variable", columns=["Variable", "N rows", "Missing", "Missing %"], rows=rows)],
        interpretation="High missingness can bias results; imputation is a separate explicit workflow (not applied automatically).",
    )


def crosstab(df: pd.DataFrame, meta, params) -> AnalysisResult:
    row_var, col_var = params["row"], params["column"]
    pct = params.get("percent", "row")
    sub = df[[row_var, col_var]].dropna()
    ct = pd.crosstab(sub[row_var], sub[col_var])
    warnings: list[str] = []
    assumptions = ["Chi-square requires expected cell counts ≥ 5 in at least 80% of cells."]
    tables = []

    display = ct.copy().astype(object)
    if pct != "none":
        denom = {"row": ct.sum(axis=1), "column": ct.sum(axis=0), "total": ct.values.sum()}[pct]
        for r in ct.index:
            for c in ct.columns:
                count = ct.loc[r, c]
                if pct == "row":
                    p = count / denom[r] * 100 if denom[r] else 0
                elif pct == "column":
                    p = count / denom[c] * 100 if denom[c] else 0
                else:
                    p = count / denom * 100 if denom else 0
                display.loc[r, c] = f"{count} ({p:.1f}%)"
    tables.append(TableOut(
        title=f"Crosstab — {label_for(meta, row_var)} × {label_for(meta, col_var)} ({pct} %)",
        columns=[""] + [value_label(meta, col_var, c) for c in ct.columns] + ["Total"],
        rows=[[value_label(meta, row_var, r)] + list(display.loc[r].values) + [int(ct.loc[r].sum())] for r in ct.index]
        + [["Total"] + [int(ct[c].sum()) for c in ct.columns] + [int(ct.values.sum())]],
    ))

    test_rows = []
    if ct.shape[0] >= 2 and ct.shape[1] >= 2 and ct.values.sum() > 0:
        chi2, p, dof, expected = stats.chi2_contingency(ct)
        n = ct.values.sum()
        cramers_v = float(np.sqrt(chi2 / (n * (min(ct.shape) - 1)))) if n > 0 and min(ct.shape) > 1 else np.nan
        test_rows.append(["Pearson chi-square (Yates-corrected for 2×2)", rounded(chi2), int(dof), rounded(p), rounded(cramers_v)])
        if (expected < 5).any():
            warnings.append("Some expected counts are below 5 — chi-square approximation may be unreliable.")
            if ct.shape == (2, 2):
                odds, fisher_p = stats.fisher_exact(ct)
                test_rows.append(["Fisher exact test (2×2)", rounded(odds), None, rounded(fisher_p), None])
                warnings.append("Fisher exact test reported due to small expected counts.")
    else:
        warnings.append("Test skipped: the table needs at least 2×2 non-empty cells.")
    if test_rows:
        tables.append(TableOut(title="Independence tests",
                               columns=["Test", "Statistic / OR", "df", "p-value", "Cramér's V"], rows=test_rows))
    return AnalysisResult(
        **_base("crosstab", "Contingency table with chi-square test (scipy.stats.chi2_contingency)",
                len(df), len(sub), "Listwise: rows missing either variable excluded."),
        assumptions=assumptions, warnings=warnings, tables=tables,
        chart={
            "data": [{"type": "heatmap",
                      "x": [str(c) for c in ct.columns], "y": [str(r) for r in ct.index],
                      "z": ct.values.tolist(), "colorscale": "Teal"}],
            "layout": {"title": "Crosstab heatmap (counts)"},
        },
        interpretation="A significant chi-square indicates the variables are associated in this sample; it does not measure the strength (see Cramér's V) or direction, and is not evidence of causation.",
    )


def correlation(df: pd.DataFrame, meta, params) -> AnalysisResult:
    variables = params["variables"]
    method = params.get("method", "pearson")
    sub = df[variables].apply(pd.to_numeric, errors="coerce").dropna()
    n = len(sub)
    fn = stats.pearsonr if method == "pearson" else stats.spearmanr
    matrix_rows = []
    pair_rows = []
    for v1 in variables:
        row = [label_for(meta, v1)]
        for v2 in variables:
            if v1 == v2:
                row.append(1.0)
                continue
            if n < 3 or sub[v1].nunique() < 2 or sub[v2].nunique() < 2:
                row.append(None)
                continue
            r, p = fn(sub[v1], sub[v2])
            row.append(rounded(float(r), 3))
            if variables.index(v2) > variables.index(v1):
                pair_rows.append([label_for(meta, v1), label_for(meta, v2), rounded(float(r)), rounded(float(p)), n])
        matrix_rows.append(row)
    return AnalysisResult(
        **_base("correlation", f"{method.title()} correlation (scipy.stats.{ 'pearsonr' if method=='pearson' else 'spearmanr'})",
                len(df), n, "Listwise deletion across all selected variables."),
        assumptions=["Pearson assumes linear relationships and is sensitive to outliers; Spearman is rank-based."],
        tables=[
            TableOut(title=f"{method.title()} correlation matrix (n={n})", columns=["", *[label_for(meta, v) for v in variables]], rows=matrix_rows),
            TableOut(title="Pairwise coefficients", columns=["Variable 1", "Variable 2", "r", "p-value", "n"], rows=pair_rows),
        ],
        chart={
            "data": [{"type": "heatmap", "x": [label_for(meta, v) for v in variables],
                      "y": [label_for(meta, v) for v in variables],
                      "z": [[c if isinstance(c, (int, float)) else None for c in r[1:]] for r in matrix_rows],
                      "zmin": -1, "zmax": 1, "colorscale": "RdBu"}],
            "layout": {"title": f"{method.title()} correlation matrix"},
        },
        interpretation="Correlation measures association, not causation. p-values test the null of zero correlation.",
    )


NPS_BANDS = {"promoters": (9, 10), "passives": (7, 8), "detractors": (0, 6)}


def nps(df: pd.DataFrame, meta, params) -> AnalysisResult:
    var = params["variable"]
    date_var = params.get("date_variable")
    period = params.get("period", "month")
    s = pd.to_numeric(df[var], errors="coerce")
    valid_mask = s.between(0, 10) & (s == s.round())
    valid = s[valid_mask]
    promoters = int((valid >= 9).sum())
    passives = int(valid.between(7, 8).sum())
    detractors = int((valid <= 6).sum())
    n = len(valid)
    score = (promoters - detractors) / n * 100 if n else None
    # Wilson-style normal-approx CI for the NPS difference of proportions
    ci_txt = None
    if n and n > 1:
        p_p, p_d = promoters / n, detractors / n
        var_nps = (p_p + p_d - (p_p - p_d) ** 2) / n
        half = 1.959964 * np.sqrt(var_nps) * 100
        ci_txt = f"[{score - half:.1f}, {score + half:.1f}]"
    tables = [TableOut(
        title=f"NPS — {label_for(meta, var)} (definition nps@1: 9-10 / 7-8 / 0-6)",
        columns=["Metric", "Value"],
        rows=[
            ["Promoters (9-10)", promoters], ["Passives (7-8)", passives], ["Detractors (0-6)", detractors],
            ["Valid responses (denominator)", n], ["Excluded (missing/out of range)", int(len(s) - n)],
            ["NPS = %promoters − %detractors", rounded(score, 1)],
            ["95% CI (normal approximation)", ci_txt],
        ])]
    chart = None
    if date_var and date_var in df.columns:
        d = pd.to_datetime(df[date_var], errors="coerce", utc=True, format="ISO8601")
        tdf = pd.DataFrame({"date": d, "score": s})[valid_mask].dropna()
        freq = {"week": "W", "month": "MS", "quarter": "QS"}.get(period, "MS")
        grouped = tdf.set_index("date").groupby(pd.Grouper(freq=freq))["score"]
        trend_rows = []
        xs, ys = [], []
        for ts, grp in grouped:
            if len(grp) == 0:
                continue
            gp = int((grp >= 9).sum())
            gd = int((grp <= 6).sum())
            gscore = (gp - gd) / len(grp) * 100
            label = ts.strftime("%Y-%m-%d")
            trend_rows.append([label, len(grp), gp, gd, rounded(gscore, 1)])
            xs.append(label)
            ys.append(round(gscore, 1))
        tables.append(TableOut(title=f"NPS trend by {period}", columns=["Period", "n", "Promoters", "Detractors", "NPS"], rows=trend_rows))
        chart = {"data": [{"type": "scatter", "mode": "lines+markers", "x": xs, "y": ys, "name": "NPS"}],
                 "layout": {"title": f"NPS trend by {period}", "yaxis": {"title": "NPS", "range": [-100, 100]}}}
    return AnalysisResult(
        **_base("nps", "Net Promoter Score (versioned definition nps@1)", len(s), n,
                "Only integer answers 0-10 count as valid; everything else is excluded and reported."),
        tables=tables, chart=chart,
        interpretation="NPS summarizes the promoter/detractor balance. Period cells with small n are unstable — read the n column before comparing periods.",
    )


def csat(df: pd.DataFrame, meta, params) -> AnalysisResult:
    var = params["variable"]
    s = pd.to_numeric(df[var], errors="coerce")
    valid = s[s.between(1, 5) & (s == s.round())]
    n = len(valid)
    satisfied = int((valid >= 4).sum())
    return AnalysisResult(
        **_base("csat", "CSAT (versioned definition csat@1: % of 4-5 on 1-5)", len(s), n,
                "Only integer answers 1-5 are valid."),
        tables=[TableOut(title=f"CSAT — {label_for(meta, var)}", columns=["Metric", "Value"], rows=[
            ["Satisfied (4-5)", satisfied], ["Valid responses", n],
            ["CSAT %", rounded(satisfied / n * 100, 1) if n else None],
            ["Mean (1-5)", rounded(float(valid.mean()), 2) if n else None],
        ])],
        interpretation="Share of satisfied respondents; the mean is reported for context.",
    )


def ces(df: pd.DataFrame, meta, params) -> AnalysisResult:
    var = params["variable"]
    s = pd.to_numeric(df[var], errors="coerce")
    valid = s[s.between(1, 7) & (s == s.round())]
    n = len(valid)
    low = int((valid >= 5).sum())
    return AnalysisResult(
        **_base("ces", "CES (versioned definition ces@1: mean of 1-7; % low effort 5-7)", len(s), n,
                "Only integer answers 1-7 are valid."),
        tables=[TableOut(title=f"CES — {label_for(meta, var)}", columns=["Metric", "Value"], rows=[
            ["Mean effort (1-7, higher = easier)", rounded(float(valid.mean()), 2) if n else None],
            ["% low effort (5-7)", rounded(low / n * 100, 1) if n else None],
            ["Valid responses", n],
        ])],
        interpretation="Higher scores mean customers found it easier to get their task done.",
    )


def trend(df: pd.DataFrame, meta, params) -> AnalysisResult:
    """Time trend of count or mean per period + basic linear forecast."""
    date_var = params["date_variable"]
    var = params.get("variable")  # None -> row counts
    period = params.get("period", "week")
    horizon = int(params.get("forecast_periods", 4))
    d = pd.to_datetime(df[date_var], errors="coerce", utc=True, format="ISO8601")
    freq = {"day": "D", "week": "W", "month": "MS"}.get(period, "W")
    if var:
        series = pd.DataFrame({"d": d, "v": pd.to_numeric(df[var], errors="coerce")}).dropna().set_index("d").groupby(pd.Grouper(freq=freq))["v"].mean()
        measure = f"mean of {label_for(meta, var)}"
    else:
        series = pd.DataFrame({"d": d}).dropna().set_index("d").groupby(pd.Grouper(freq=freq)).size()
        measure = "count of rows"
    series = series.dropna()
    warnings = []
    xs = [ts.strftime("%Y-%m-%d") for ts in series.index]
    ys = [rounded(float(v), 2) for v in series.values]
    forecast_rows = []
    fc_x, fc_y = [], []
    if len(series) >= 4:
        import statsmodels.api as sm
        t = np.arange(len(series))
        model = sm.OLS(series.values.astype(float), sm.add_constant(t)).fit()
        future_t = np.arange(len(series), len(series) + horizon)
        pred = model.get_prediction(sm.add_constant(future_t))
        frame = pred.summary_frame(alpha=0.05)
        offset = series.index[-1] - series.index[-2] if len(series) > 1 else pd.Timedelta(days=7)
        for i, ft in enumerate(future_t):
            ts = series.index[-1] + offset * (i + 1)
            forecast_rows.append([ts.strftime("%Y-%m-%d"), rounded(float(frame["mean"].iloc[i]), 2),
                                  f"[{frame['mean_ci_lower'].iloc[i]:.2f}, {frame['mean_ci_upper'].iloc[i]:.2f}]"])
            fc_x.append(ts.strftime("%Y-%m-%d"))
            fc_y.append(round(float(frame["mean"].iloc[i]), 2))
        warnings.append("Forecast is a simple linear extrapolation (OLS on period index) — a baseline, not a seasonal model.")
    else:
        warnings.append("Too few periods (<4) for a forecast; showing the observed series only.")
    tables = [TableOut(title=f"Observed {measure} per {period}", columns=["Period", "Value"], rows=[[x, y] for x, y in zip(xs, ys)])]
    if forecast_rows:
        tables.append(TableOut(title=f"Linear forecast (+{horizon} periods)", columns=["Period", "Forecast", "95% CI"], rows=forecast_rows))
    return AnalysisResult(
        **_base("trend", "Time aggregation with linear OLS forecast (statsmodels)", len(df), int(series.sum() if not var else len(df)),
                "Rows with unparseable dates (or missing values for the measured variable) are excluded."),
        warnings=warnings, tables=tables,
        chart={"data": [
            {"type": "scatter", "mode": "lines+markers", "x": xs, "y": ys, "name": "observed"},
            *([{"type": "scatter", "mode": "lines", "line": {"dash": "dash"}, "x": fc_x, "y": fc_y, "name": "forecast"}] if fc_x else []),
        ], "layout": {"title": f"{measure} per {period}"}},
        interpretation="Shows the level over time. The dashed forecast assumes the linear trend continues, which real data rarely does for long.",
    )
