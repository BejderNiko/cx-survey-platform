"""Inferential procedures: group comparisons, regression, reliability,
bootstrap, clustering, and factor analysis."""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from .contracts import AnalysisResult, TableOut
from .frame import label_for, rounded, value_label
from .procedures_basic import _base


def _two_groups(df: pd.DataFrame, variable: str, group: str):
    sub = df[[variable, group]].copy()
    sub[variable] = pd.to_numeric(sub[variable], errors="coerce")
    sub = sub.dropna()
    levels = sorted(sub[group].unique(), key=str)
    return sub, levels


def ttest_ind(df: pd.DataFrame, meta, params) -> AnalysisResult:
    variable, group = params["variable"], params["group"]
    equal_var = bool(params.get("equal_var", False))
    sub, levels = _two_groups(df, variable, group)
    if len(levels) != 2:
        raise ValueError(f"Grouping variable must have exactly 2 levels; found {len(levels)}.")
    a = sub.loc[sub[group] == levels[0], variable]
    b = sub.loc[sub[group] == levels[1], variable]
    t, p = stats.ttest_ind(a, b, equal_var=equal_var)
    if equal_var:
        dof = len(a) + len(b) - 2
    else:  # Welch–Satterthwaite
        va, vb = a.var(ddof=1) / len(a), b.var(ddof=1) / len(b)
        dof = (va + vb) ** 2 / (va**2 / (len(a) - 1) + vb**2 / (len(b) - 1))
    sp = np.sqrt(((len(a) - 1) * a.var(ddof=1) + (len(b) - 1) * b.var(ddof=1)) / (len(a) + len(b) - 2))
    cohens_d = (a.mean() - b.mean()) / sp if sp > 0 else np.nan
    diff = a.mean() - b.mean()
    se_diff = np.sqrt(a.var(ddof=1) / len(a) + b.var(ddof=1) / len(b))
    tcrit = stats.t.ppf(0.975, dof)
    lev_stat, lev_p = stats.levene(a, b)
    return AnalysisResult(
        **_base("ttest_ind",
                f"{'Student' if equal_var else 'Welch'} independent-samples t-test (scipy.stats.ttest_ind)",
                len(df), len(sub), "Listwise: rows missing the variable or the group excluded."),
        assumptions=[
            "Approximately normal distributions within groups (robust for n ≳ 30).",
            f"Levene's test for equal variances: W={lev_stat:.3f}, p={lev_p:.4f}"
            + (" — equal-variance assumption questionable; Welch correction recommended." if lev_p < 0.05 and equal_var else "."),
        ],
        tables=[
            TableOut(title="Group statistics", columns=["Group", "n", "Mean", "SD"], rows=[
                [value_label(meta, group, levels[0]), len(a), rounded(a.mean()), rounded(a.std(ddof=1))],
                [value_label(meta, group, levels[1]), len(b), rounded(b.mean()), rounded(b.std(ddof=1))],
            ]),
            TableOut(title="Test result", columns=["t", "df", "p (two-sided)", "Mean difference", "95% CI of difference", "Cohen's d"],
                     rows=[[rounded(float(t)), rounded(float(dof), 2), rounded(float(p)),
                            rounded(float(diff)), f"[{diff - tcrit * se_diff:.4f}, {diff + tcrit * se_diff:.4f}]",
                            rounded(float(cohens_d))]]),
        ],
        interpretation="Tests whether the two group means differ. Statistical significance is not business importance — read the mean difference and Cohen's d.",
    )


def ttest_rel(df: pd.DataFrame, meta, params) -> AnalysisResult:
    v1, v2 = params["variable1"], params["variable2"]
    sub = df[[v1, v2]].apply(pd.to_numeric, errors="coerce").dropna()
    t, p = stats.ttest_rel(sub[v1], sub[v2])
    diff = sub[v1] - sub[v2]
    d = diff.mean() / diff.std(ddof=1) if diff.std(ddof=1) > 0 else np.nan
    return AnalysisResult(
        **_base("ttest_rel", "Paired-samples t-test (scipy.stats.ttest_rel)", len(df), len(sub),
                "Pairs with either value missing are excluded."),
        assumptions=["Differences approximately normally distributed."],
        tables=[TableOut(title="Paired test", columns=["Pair", "n", "Mean diff", "SD diff", "t", "df", "p", "Cohen's d (paired)"],
                         rows=[[f"{label_for(meta, v1)} − {label_for(meta, v2)}", len(sub), rounded(diff.mean()),
                                rounded(diff.std(ddof=1)), rounded(float(t)), len(sub) - 1, rounded(float(p)), rounded(float(d))]])],
        interpretation="Tests the mean within-pair difference against zero.",
    )


def anova(df: pd.DataFrame, meta, params) -> AnalysisResult:
    variable, group = params["variable"], params["group"]
    sub, levels = _two_groups(df, variable, group)
    groups = [sub.loc[sub[group] == lv, variable] for lv in levels]
    if len(levels) < 2:
        raise ValueError("ANOVA needs at least 2 groups.")
    f, p = stats.f_oneway(*groups)
    grand = sub[variable].mean()
    ss_between = sum(len(g) * (g.mean() - grand) ** 2 for g in groups)
    ss_total = ((sub[variable] - grand) ** 2).sum()
    eta_sq = ss_between / ss_total if ss_total > 0 else np.nan
    group_rows = [[value_label(meta, group, lv), len(g), rounded(g.mean()), rounded(g.std(ddof=1))]
                  for lv, g in zip(levels, groups)]
    tables = [
        TableOut(title="Group statistics", columns=["Group", "n", "Mean", "SD"], rows=group_rows),
        TableOut(title="One-way ANOVA", columns=["F", "df (between, within)", "p", "Eta squared"],
                 rows=[[rounded(float(f)), f"({len(levels) - 1}, {len(sub) - len(levels)})", rounded(float(p)), rounded(float(eta_sq))]]),
    ]
    warnings = []
    if len(levels) > 2:
        from statsmodels.stats.multicomp import pairwise_tukeyhsd
        tukey = pairwise_tukeyhsd(sub[variable], sub[group].astype(str), alpha=0.05)
        tk = tukey.summary().data
        tables.append(TableOut(title="Tukey HSD post-hoc comparisons (family-wise alpha 0.05)",
                               columns=[str(c) for c in tk[0]], rows=[[rounded(c) if isinstance(c, float) else str(c) for c in r] for r in tk[1:]]))
    else:
        warnings.append("Post-hoc comparisons skipped with only two groups (the omnibus test already answers it).")
    return AnalysisResult(
        **_base("anova", "One-way ANOVA (scipy.stats.f_oneway) with Tukey HSD post-hoc (statsmodels)",
                len(df), len(sub), "Listwise deletion."),
        assumptions=["Approximate normality within groups.", "Homogeneity of variances (consider Kruskal-Wallis when violated)."],
        warnings=warnings, tables=tables,
        chart={"data": [{"type": "box", "y": g.tolist(), "name": str(value_label(meta, group, lv))} for lv, g in zip(levels, groups)],
               "layout": {"title": f"{label_for(meta, variable)} by {label_for(meta, group)}", "yaxis": {"title": label_for(meta, variable)}}},
        interpretation="A significant F says at least one group mean differs; the post-hoc table shows which pairs (corrected for multiple comparisons).",
    )


def mannwhitney(df: pd.DataFrame, meta, params) -> AnalysisResult:
    variable, group = params["variable"], params["group"]
    sub, levels = _two_groups(df, variable, group)
    if len(levels) != 2:
        raise ValueError("Mann-Whitney U needs exactly 2 groups.")
    a = sub.loc[sub[group] == levels[0], variable]
    b = sub.loc[sub[group] == levels[1], variable]
    u, p = stats.mannwhitneyu(a, b, alternative="two-sided")
    return AnalysisResult(
        **_base("mannwhitney", "Mann-Whitney U (scipy.stats.mannwhitneyu, two-sided)", len(df), len(sub), "Listwise deletion."),
        assumptions=["Distribution-free; compares stochastic dominance, not means."],
        tables=[TableOut(title="Test result", columns=["Group A (n, median)", "Group B (n, median)", "U", "p"],
                         rows=[[f"{value_label(meta, group, levels[0])} ({len(a)}, {rounded(float(a.median()))})",
                                f"{value_label(meta, group, levels[1])} ({len(b)}, {rounded(float(b.median()))})",
                                rounded(float(u)), rounded(float(p))]])],
        interpretation="Nonparametric alternative to the independent t-test for skewed or ordinal data.",
    )


def kruskal(df: pd.DataFrame, meta, params) -> AnalysisResult:
    variable, group = params["variable"], params["group"]
    sub, levels = _two_groups(df, variable, group)
    groups = [sub.loc[sub[group] == lv, variable] for lv in levels]
    h, p = stats.kruskal(*groups)
    return AnalysisResult(
        **_base("kruskal", "Kruskal-Wallis H (scipy.stats.kruskal)", len(df), len(sub), "Listwise deletion."),
        tables=[TableOut(title="Test result", columns=["H", "df", "p", "Groups (n)"],
                         rows=[[rounded(float(h)), len(levels) - 1, rounded(float(p)),
                                ", ".join(f"{value_label(meta, group, lv)}({len(g)})" for lv, g in zip(levels, groups))]])],
        interpretation="Nonparametric alternative to one-way ANOVA.",
    )


def wilcoxon(df: pd.DataFrame, meta, params) -> AnalysisResult:
    v1, v2 = params["variable1"], params["variable2"]
    sub = df[[v1, v2]].apply(pd.to_numeric, errors="coerce").dropna()
    w, p = stats.wilcoxon(sub[v1], sub[v2])
    return AnalysisResult(
        **_base("wilcoxon", "Wilcoxon signed-rank test (scipy.stats.wilcoxon)", len(df), len(sub),
                "Pairs with either value missing are excluded."),
        tables=[TableOut(title="Test result", columns=["n pairs", "W", "p"],
                         rows=[[len(sub), rounded(float(w)), rounded(float(p))]])],
        interpretation="Nonparametric alternative to the paired t-test.",
    )


def linear_regression(df: pd.DataFrame, meta, params) -> AnalysisResult:
    import statsmodels.api as sm

    dependent = params["dependent"]
    predictors: list[str] = params["predictors"]
    sub = df[[dependent, *predictors]].copy()
    sub[dependent] = pd.to_numeric(sub[dependent], errors="coerce")
    numeric_preds, categorical_preds = [], []
    for pvar in predictors:
        as_num = pd.to_numeric(sub[pvar], errors="coerce")
        if as_num.notna().sum() >= sub[pvar].notna().sum() * 0.9:
            sub[pvar] = as_num
            numeric_preds.append(pvar)
        else:
            categorical_preds.append(pvar)
    sub = sub.dropna()
    X = pd.get_dummies(sub[predictors], columns=categorical_preds, drop_first=True).astype(float)
    X = sm.add_constant(X)
    model = sm.OLS(sub[dependent].astype(float), X).fit()
    ci = model.conf_int()
    coef_rows = [[name, rounded(model.params[name]), rounded(model.bse[name]), rounded(model.tvalues[name]),
                  rounded(model.pvalues[name]), f"[{ci.loc[name, 0]:.4f}, {ci.loc[name, 1]:.4f}]"]
                 for name in model.params.index]
    return AnalysisResult(
        **_base("linear_regression", "Ordinary least squares (statsmodels.OLS); categorical predictors dummy-coded (first level as reference)",
                len(df), int(model.nobs), "Listwise deletion across dependent and predictors."),
        assumptions=["Linearity, independent errors, homoscedasticity, approximately normal residuals."],
        warnings=(["Model is likely overfit: fewer than 10 observations per parameter."] if model.nobs < 10 * len(model.params) else []),
        tables=[
            TableOut(title="Model summary", columns=["R²", "Adjusted R²", "F", "df (model, resid)", "p (F)", "n"],
                     rows=[[rounded(model.rsquared), rounded(model.rsquared_adj), rounded(model.fvalue),
                            f"({int(model.df_model)}, {int(model.df_resid)})", rounded(model.f_pvalue), int(model.nobs)]]),
            TableOut(title="Coefficients", columns=["Term", "b", "SE", "t", "p", "95% CI"], rows=coef_rows),
        ],
        interpretation="Coefficients are conditional associations given the other predictors — not causal effects. Check residuals before trusting inference.",
    )


def logistic_regression(df: pd.DataFrame, meta, params) -> AnalysisResult:
    import statsmodels.api as sm

    dependent = params["dependent"]
    predictors: list[str] = params["predictors"]
    sub = df[[dependent, *predictors]].copy()
    sub[dependent] = pd.to_numeric(sub[dependent], errors="coerce")
    sub = sub.dropna()
    unique = sorted(sub[dependent].unique())
    if len(unique) != 2:
        raise ValueError(f"Binary logistic regression needs a 0/1 outcome; found values {unique[:5]}.")
    y = (sub[dependent] == unique[1]).astype(float)
    categorical = [p for p in predictors if not np.issubdtype(pd.to_numeric(sub[p], errors="coerce").dropna().dtype, np.number)
                   or pd.to_numeric(sub[p], errors="coerce").isna().any()]
    X = pd.get_dummies(sub[predictors], columns=[c for c in categorical], drop_first=True).astype(float)
    X = sm.add_constant(X)
    model = sm.Logit(y, X).fit(disp=0)
    ci = model.conf_int()
    rows = [[name, rounded(model.params[name]), rounded(model.bse[name]), rounded(np.exp(model.params[name])),
             f"[{np.exp(ci.loc[name, 0]):.4f}, {np.exp(ci.loc[name, 1]):.4f}]", rounded(model.pvalues[name])]
            for name in model.params.index]
    return AnalysisResult(
        **_base("logistic_regression",
                f"Binary logistic regression (statsmodels.Logit); outcome coded 1 = '{unique[1]}'",
                len(df), int(model.nobs), "Listwise deletion."),
        warnings=(["Possible separation/small-sample instability — interpret with caution."] if not model.mle_retvals.get("converged", True) else []),
        tables=[
            TableOut(title="Model summary", columns=["Pseudo R² (McFadden)", "Log-likelihood", "LLR p-value", "n"],
                     rows=[[rounded(model.prsquared), rounded(model.llf), rounded(model.llr_pvalue), int(model.nobs)]]),
            TableOut(title="Coefficients", columns=["Term", "b (log-odds)", "SE", "Odds ratio", "OR 95% CI", "p"], rows=rows),
        ],
        interpretation="Odds ratios above 1 increase the odds of the outcome. Associations are conditional on the other predictors, not causal.",
    )


def cronbach_alpha(df: pd.DataFrame, meta, params) -> AnalysisResult:
    variables: list[str] = params["variables"]
    sub = df[variables].apply(pd.to_numeric, errors="coerce").dropna()
    k = len(variables)
    if k < 2:
        raise ValueError("Reliability analysis needs at least 2 items.")
    item_vars = sub.var(axis=0, ddof=1)
    total_var = sub.sum(axis=1).var(ddof=1)
    alpha = k / (k - 1) * (1 - item_vars.sum() / total_var) if total_var > 0 else np.nan
    item_rows = []
    for v in variables:
        rest = sub[[c for c in variables if c != v]].sum(axis=1)
        r_it = sub[v].corr(rest)
        rem = [c for c in variables if c != v]
        iv = sub[rem].var(axis=0, ddof=1)
        tv = sub[rem].sum(axis=1).var(ddof=1)
        alpha_wo = (k - 1) / (k - 2) * (1 - iv.sum() / tv) if k > 2 and tv > 0 else np.nan
        item_rows.append([label_for(meta, v), rounded(float(sub[v].mean())), rounded(float(r_it), 3), rounded(float(alpha_wo), 3)])
    return AnalysisResult(
        **_base("cronbach_alpha", "Cronbach's alpha (classical formula on item covariances)", len(df), len(sub),
                "Listwise deletion across all items."),
        assumptions=["Items measure a single underlying construct on comparable scales (tau-equivalence)."],
        tables=[
            TableOut(title="Reliability", columns=["Cronbach's alpha", "Items", "n"],
                     rows=[[rounded(float(alpha), 3), k, len(sub)]]),
            TableOut(title="Item-total statistics", columns=["Item", "Mean", "Item-rest correlation", "Alpha if item deleted"], rows=item_rows),
        ],
        interpretation="Alpha ≥ 0.7 is conventionally acceptable for scales; low item-rest correlations point to items that do not fit the scale.",
    )


def bootstrap(df: pd.DataFrame, meta, params, seed: int | None) -> AnalysisResult:
    variable = params["variable"]
    statistic = params.get("statistic", "mean")
    n_boot = int(params.get("n_boot", 2000))
    used_seed = seed if seed is not None else 12345
    rng = np.random.default_rng(used_seed)
    s = pd.to_numeric(df[variable], errors="coerce").dropna().to_numpy()
    if len(s) < 2:
        raise ValueError("Bootstrap needs at least 2 valid observations.")
    fn = {"mean": np.mean, "median": np.median, "std": lambda x: np.std(x, ddof=1)}[statistic]
    boots = np.array([fn(rng.choice(s, size=len(s), replace=True)) for _ in range(n_boot)])
    lo, hi = np.percentile(boots, [2.5, 97.5])
    return AnalysisResult(
        **_base("bootstrap", f"Nonparametric bootstrap of the {statistic} ({n_boot} resamples, percentile CI)",
                len(df), len(s), "Missing values excluded before resampling."),
        seed=used_seed,
        tables=[TableOut(title=f"Bootstrap — {label_for(meta, variable)}",
                         columns=["Statistic", "Point estimate", "Bootstrap SE", "95% percentile CI", "Resamples", "Seed"],
                         rows=[[statistic, rounded(float(fn(s))), rounded(float(boots.std(ddof=1))),
                                f"[{lo:.4f}, {hi:.4f}]", n_boot, used_seed]])],
        chart={"data": [{"type": "histogram", "x": boots.tolist(), "nbinsx": 40}],
               "layout": {"title": f"Bootstrap distribution of the {statistic}"}},
        interpretation="The CI reflects sampling variability without normality assumptions. The recorded seed makes the run reproducible.",
    )


def kmeans(df: pd.DataFrame, meta, params, seed: int | None) -> AnalysisResult:
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score
    from sklearn.preprocessing import StandardScaler

    variables: list[str] = params["variables"]
    k = int(params.get("k", 3))
    used_seed = seed if seed is not None else 12345
    sub = df[variables].apply(pd.to_numeric, errors="coerce").dropna()
    if len(sub) <= k:
        raise ValueError("Not enough complete rows for the requested number of clusters.")
    X = StandardScaler().fit_transform(sub)
    km = KMeans(n_clusters=k, random_state=used_seed, n_init=10).fit(X)
    sil = float(silhouette_score(X, km.labels_)) if k > 1 else np.nan
    center_rows = []
    for i in range(k):
        mask = km.labels_ == i
        center_rows.append([f"Cluster {i + 1}", int(mask.sum())] + [rounded(float(sub.loc[mask, v].mean()), 2) for v in variables])
    return AnalysisResult(
        **_base("kmeans", f"K-means clustering (scikit-learn, k={k}, standardized features, n_init=10)",
                len(df), len(sub), "Listwise deletion."),
        seed=used_seed,
        tables=[TableOut(title="Cluster profile (means on original scale)",
                         columns=["Cluster", "n", *[label_for(meta, v) for v in variables]], rows=center_rows),
                TableOut(title="Fit", columns=["Silhouette score (-1..1)", "Inertia"],
                         rows=[[rounded(sil, 3), rounded(float(km.inertia_), 1)]])],
        interpretation="Clusters are a descriptive segmentation of this sample; the silhouette score indicates separation quality. K is chosen by you, not the data.",
    )


def factor(df: pd.DataFrame, meta, params, seed: int | None) -> AnalysisResult:
    from sklearn.decomposition import FactorAnalysis
    from sklearn.preprocessing import StandardScaler

    variables: list[str] = params["variables"]
    n_factors = int(params.get("n_factors", 2))
    used_seed = seed if seed is not None else 12345
    sub = df[variables].apply(pd.to_numeric, errors="coerce").dropna()
    if len(sub) < len(variables) * 3:
        raise ValueError("Factor analysis needs at least ~3 rows per item.")
    X = StandardScaler().fit_transform(sub)
    fa = FactorAnalysis(n_components=n_factors, random_state=used_seed).fit(X)
    loadings = fa.components_.T
    rows = [[label_for(meta, v)] + [rounded(float(loadings[i, j]), 3) for j in range(n_factors)]
            for i, v in enumerate(variables)]
    return AnalysisResult(
        **_base("factor", f"Exploratory factor analysis (scikit-learn FactorAnalysis, {n_factors} factors, unrotated ML loadings)",
                len(df), len(sub), "Listwise deletion; items standardized."),
        seed=used_seed,
        warnings=["Loadings are unrotated; rotated solutions (varimax/oblimin) are a later milestone."],
        tables=[TableOut(title="Factor loadings", columns=["Item", *[f"Factor {j + 1}" for j in range(n_factors)]], rows=rows)],
        interpretation="Items loading strongly on the same factor likely measure the same underlying construct.",
    )
