"""Numerical validation against independently known fixtures.

Expected values are hand-computed, exact-by-construction, or published
(Greene's econometrics values for the Spector dataset), so a regression in
scipy/statsmodels usage would fail here rather than silently produce wrong
statistics.
"""
from __future__ import annotations

import math

import pytest

from ok_analytics.contracts import AnalysisRequest, DatasetPayload, VariableMeta
from ok_analytics.frame import to_frame
from ok_analytics.registry import run_procedure


def make_dataset(columns: dict[str, list], measures: dict[str, str] | None = None) -> DatasetPayload:
    names = list(columns.keys())
    n = len(next(iter(columns.values())))
    variables = [
        VariableMeta(name=c, var_type="numeric" if all(isinstance(v, (int, float)) or v is None for v in columns[c]) else "string",
                     measure=(measures or {}).get(c, "scale"))
        for c in names
    ]
    rows = [{c: columns[c][i] for c in names} for i in range(n)]
    return DatasetPayload(variables=variables, rows=rows)


def run(procedure: str, dataset: DatasetPayload, params: dict, seed: int | None = None):
    df, meta = to_frame(dataset)
    return run_procedure(procedure, df, meta, params, seed)


def cell(result, table_idx, row, col):
    return result.tables[table_idx].rows[row][col]


class TestFrequenciesAndDescriptives:
    def test_frequencies_counts_and_percent(self):
        ds = make_dataset({"color": ["red", "red", "blue", None]})
        r = run("frequencies", ds, {"variable": "color"})
        rows = {row[0]: row for row in r.tables[0].rows}
        assert rows["red"][1] == 2
        assert rows["red"][3] == pytest.approx(66.7, abs=0.05)  # valid %
        assert rows["blue"][3] == pytest.approx(33.3, abs=0.05)
        assert rows["(missing)"][1] == 1
        assert r.n_used == 3 and r.n_excluded == 1

    def test_descriptives_known_values(self):
        # x = 2,4,4,4,5,5,7,9: mean 5, population sd 2, sample sd 2.138
        ds = make_dataset({"x": [2, 4, 4, 4, 5, 5, 7, 9]})
        r = run("descriptives", ds, {"variables": ["x"]})
        row = r.tables[0].rows[0]
        assert row[3] == pytest.approx(5.0)       # mean
        assert row[4] == pytest.approx(4.5)       # median
        assert row[6] == pytest.approx(2.1381, abs=1e-3)  # sample SD

    def test_descriptives_weighted_mean(self):
        # values 1,3 with weights 1,3 -> weighted mean 2.5
        ds = make_dataset({"x": [1, 3], "w": [1, 3]})
        r = run("descriptives", ds, {"variables": ["x"], "weight": "w"})
        assert r.tables[0].rows[0][3] == pytest.approx(2.5)

    def test_missingness(self):
        ds = make_dataset({"a": [1, None, None], "b": [1, 2, 3]})
        r = run("missingness", ds, {})
        rows = {row[0]: row for row in r.tables[0].rows}
        assert rows["a"][2] == 2 and rows["b"][2] == 0


class TestCrosstabAndChi2:
    def test_chi2_2x2_yates(self):
        # [[10,20],[20,10]]: chi2 with Yates correction = 5.4, p ≈ 0.0201
        ds = make_dataset({"g": ["a"] * 30 + ["b"] * 30, "o": ["x"] * 10 + ["y"] * 20 + ["x"] * 20 + ["y"] * 10})
        r = run("crosstab", ds, {"row": "g", "column": "o"})
        test = r.tables[1].rows[0]
        assert test[1] == pytest.approx(5.4, abs=1e-6)
        assert test[2] == 1
        assert test[3] == pytest.approx(0.020136, abs=1e-4)

    def test_fisher_exact_small_cells(self):
        # [[2,8],[10,2]] has an expected count of 4.55 (<5) -> Fisher path.
        # Cross-validated against an independent two-sided hypergeometric
        # computation (sum of table probabilities <= observed probability).
        table = [[2, 8], [10, 2]]
        ds = make_dataset({
            "g": ["a"] * 10 + ["b"] * 12,
            "o": ["x"] * 2 + ["y"] * 8 + ["x"] * 10 + ["y"] * 2,
        })
        r = run("crosstab", ds, {"row": "g", "column": "o"})
        fisher = [row for row in r.tables[1].rows if "Fisher" in row[0]]
        assert fisher, "Fisher path must trigger for small expected counts"

        # independent implementation of the two-sided Fisher exact p-value
        row1, row2 = sum(table[0]), sum(table[1])
        col1 = table[0][0] + table[1][0]
        n = row1 + row2
        def hyper_p(a: int) -> float:
            return (math.comb(row1, a) * math.comb(row2, col1 - a)) / math.comb(n, col1)
        p_obs = hyper_p(table[0][0])
        expected_p = sum(hyper_p(a) for a in range(max(0, col1 - row2), min(row1, col1) + 1)
                         if hyper_p(a) <= p_obs * (1 + 1e-9))
        assert fisher[0][3] == pytest.approx(expected_p, abs=1e-6)


class TestCorrelation:
    def test_pearson_perfect(self):
        ds = make_dataset({"x": [1, 2, 3, 4, 5], "y": [2, 4, 6, 8, 10], "z": [5, 4, 3, 2, 1]})
        r = run("correlation", ds, {"variables": ["x", "y", "z"], "method": "pearson"})
        pairs = {(row[0], row[1]): row for row in r.tables[1].rows}
        assert pairs[("x", "y")][2] == pytest.approx(1.0)
        assert pairs[("x", "z")][2] == pytest.approx(-1.0)

    def test_pearson_known_08(self):
        # classic fixture: r = 0.8
        ds = make_dataset({"x": [1, 2, 3, 4, 5], "y": [1, 3, 2, 5, 4]})
        r = run("correlation", ds, {"variables": ["x", "y"], "method": "pearson"})
        assert r.tables[1].rows[0][2] == pytest.approx(0.8)

    def test_spearman_monotonic(self):
        ds = make_dataset({"x": [1, 2, 3, 4, 5], "y": [1, 8, 27, 64, 125]})
        r = run("correlation", ds, {"variables": ["x", "y"], "method": "spearman"})
        assert r.tables[1].rows[0][2] == pytest.approx(1.0)


class TestGroupComparisons:
    def test_ttest_equal_groups_is_null(self):
        ds = make_dataset({"v": [1, 2, 3, 1, 2, 3], "g": ["a", "a", "a", "b", "b", "b"]})
        r = run("ttest_ind", ds, {"variable": "v", "group": "g"})
        t_row = r.tables[1].rows[0]
        assert t_row[0] == pytest.approx(0.0)
        assert t_row[2] == pytest.approx(1.0)

    def test_welch_ttest_hand_computed(self):
        # A=[1..5] (mean 3, var 2.5), B=[2,4,6,8,10] (mean 6, var 10)
        # t = -3 / sqrt(2.5/5 + 10/5) = -3/sqrt(2.5) = -1.897366...
        ds = make_dataset({"v": [1, 2, 3, 4, 5, 2, 4, 6, 8, 10], "g": ["a"] * 5 + ["b"] * 5})
        r = run("ttest_ind", ds, {"variable": "v", "group": "g", "equal_var": False})
        assert r.tables[1].rows[0][0] == pytest.approx(-1.897366, abs=1e-5)

    def test_anova_hand_computed(self):
        # groups [1,2,3],[2,3,4],[3,4,5]: F = 3.0, p = 0.125
        ds = make_dataset({"v": [1, 2, 3, 2, 3, 4, 3, 4, 5], "g": ["a"] * 3 + ["b"] * 3 + ["c"] * 3})
        r = run("anova", ds, {"variable": "v", "group": "g"})
        f_row = r.tables[1].rows[0]
        assert f_row[0] == pytest.approx(3.0, abs=1e-9)
        assert f_row[2] == pytest.approx(0.125, abs=1e-9)
        assert any("Tukey" in t.title for t in r.tables)

    def test_paired_ttest_zero_diff_degenerate(self):
        # identical pairs -> zero-variance differences; scipy reports nan,
        # which the contract surfaces as null rather than a fake number
        ds = make_dataset({"a": [1, 2, 3, 4], "b": [1, 2, 3, 4]})
        r = run("ttest_rel", ds, {"variable1": "a", "variable2": "b"})
        assert r.tables[0].rows[0][4] is None  # t
        assert r.tables[0].rows[0][2] == pytest.approx(0.0)  # mean diff

    def test_mannwhitney_and_kruskal_run(self):
        ds = make_dataset({"v": [1, 2, 3, 10, 11, 12], "g": ["a"] * 3 + ["b"] * 3})
        mw = run("mannwhitney", ds, {"variable": "v", "group": "g"})
        assert mw.tables[0].rows[0][3] == pytest.approx(0.1, abs=0.02)  # exact p for total separation n=3,3
        kw = run("kruskal", ds, {"variable": "v", "group": "g"})
        assert kw.tables[0].rows[0][2] < 0.1


class TestRegression:
    def test_ols_exact_fit(self):
        # y = 2x + 1 exactly
        ds = make_dataset({"x": [1, 2, 3, 4, 5], "y": [3, 5, 7, 9, 11]})
        r = run("linear_regression", ds, {"dependent": "y", "predictors": ["x"]})
        summary = r.tables[0].rows[0]
        coefs = {row[0]: row for row in r.tables[1].rows}
        assert summary[0] == pytest.approx(1.0)          # R²
        assert coefs["const"][1] == pytest.approx(1.0)
        assert coefs["x"][1] == pytest.approx(2.0)

    def test_logistic_spector_published_coefficients(self):
        # Spector & Mazzeo (1980) via statsmodels; published Logit MLEs:
        # const -13.0213, gpa 2.8261, tuce 0.0952, psi 2.3787
        import statsmodels.api as sm

        data = sm.datasets.spector.load_pandas()
        cols = {c: data.exog[c].tolist() for c in data.exog.columns}
        cols["grade"] = data.endog.tolist()
        ds = make_dataset(cols)
        r = run("logistic_regression", ds, {"dependent": "grade", "predictors": ["GPA", "TUCE", "PSI"]})
        coefs = {row[0]: row for row in r.tables[1].rows}
        assert coefs["const"][1] == pytest.approx(-13.0213, abs=1e-3)
        assert coefs["GPA"][1] == pytest.approx(2.8261, abs=1e-3)
        assert coefs["TUCE"][1] == pytest.approx(0.0952, abs=1e-3)
        assert coefs["PSI"][1] == pytest.approx(2.3787, abs=1e-3)


class TestReliability:
    def test_alpha_perfectly_correlated_items(self):
        ds = make_dataset({"i1": [1, 2, 3, 4], "i2": [1, 2, 3, 4], "i3": [1, 2, 3, 4]})
        r = run("cronbach_alpha", ds, {"variables": ["i1", "i2", "i3"]})
        assert r.tables[0].rows[0][0] == pytest.approx(1.0)

    def test_alpha_needs_two_items(self):
        ds = make_dataset({"i1": [1, 2, 3]})
        with pytest.raises(ValueError):
            run("cronbach_alpha", ds, {"variables": ["i1"]})


class TestCxMetrics:
    def test_nps_banding_and_denominator(self):
        # [9,10,7,0] -> promoters 2 (50%), detractors 1 (25%), NPS = 25
        ds = make_dataset({"nps": [9, 10, 7, 0, None, 11]})
        r = run("nps", ds, {"variable": "nps"})
        rows = {row[0]: row[1] for row in r.tables[0].rows}
        assert rows["Promoters (9-10)"] == 2
        assert rows["Passives (7-8)"] == 1
        assert rows["Detractors (0-6)"] == 1
        assert rows["Valid responses (denominator)"] == 4
        assert rows["Excluded (missing/out of range)"] == 2
        assert rows["NPS = %promoters − %detractors"] == pytest.approx(25.0)

    def test_nps_empty(self):
        ds = make_dataset({"nps": [None, None]})
        r = run("nps", ds, {"variable": "nps"})
        rows = {row[0]: row[1] for row in r.tables[0].rows}
        assert rows["Valid responses (denominator)"] == 0
        assert rows["NPS = %promoters − %detractors"] is None

    def test_csat_and_ces(self):
        csat = run("csat", make_dataset({"c": [5, 4, 3, 2, 1, 4]}), {"variable": "c"})
        rows = {row[0]: row[1] for row in csat.tables[0].rows}
        assert rows["CSAT %"] == pytest.approx(50.0)
        ces = run("ces", make_dataset({"c": [7, 6, 5, 4, 1]}), {"variable": "c"})
        rows = {row[0]: row[1] for row in ces.tables[0].rows}
        assert rows["Mean effort (1-7, higher = easier)"] == pytest.approx(4.6)
        assert rows["% low effort (5-7)"] == pytest.approx(60.0)


class TestSeededProcedures:
    def test_bootstrap_deterministic_and_sane(self):
        ds = make_dataset({"x": [2, 4, 4, 4, 5, 5, 7, 9]})
        r1 = run("bootstrap", ds, {"variable": "x", "statistic": "mean", "n_boot": 500}, seed=42)
        r2 = run("bootstrap", ds, {"variable": "x", "statistic": "mean", "n_boot": 500}, seed=42)
        assert r1.tables[0].rows[0] == r2.tables[0].rows[0]
        assert r1.seed == 42
        assert r1.tables[0].rows[0][1] == pytest.approx(5.0)  # point estimate = sample mean

    def test_kmeans_obvious_clusters(self):
        ds = make_dataset({"x": [0.1, 0.2, 0.15, 5.1, 5.2, 5.15], "y": [0.1, 0.15, 0.2, 5.1, 5.15, 5.2]})
        r = run("kmeans", ds, {"variables": ["x", "y"], "k": 2}, seed=7)
        sizes = sorted(row[1] for row in r.tables[0].rows)
        assert sizes == [3, 3]

    def test_factor_runs_on_two_constructs(self):
        base1 = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 2, 3]
        base2 = [5, 4, 3, 2, 1, 5, 4, 3, 2, 1, 4, 3]
        ds = make_dataset({
            "a1": base1, "a2": [v + 0.1 for v in base1],
            "b1": base2, "b2": [v - 0.1 for v in base2],
        })
        r = run("factor", ds, {"variables": ["a1", "a2", "b1", "b2"], "n_factors": 1}, seed=3)
        loadings = [row[1] for row in r.tables[0].rows]
        # a-items and b-items must load with opposite signs on the single factor
        assert math.copysign(1, loadings[0]) == math.copysign(1, loadings[1])
        assert math.copysign(1, loadings[0]) != math.copysign(1, loadings[2])


class TestEdgeCases:
    def test_unknown_procedure(self):
        ds = make_dataset({"x": [1]})
        with pytest.raises(ValueError, match="Unknown procedure"):
            run("nope", ds, {})

    def test_tiny_sample_descriptives(self):
        ds = make_dataset({"x": [42]})
        r = run("descriptives", ds, {"variables": ["x"]})
        row = r.tables[0].rows[0]
        assert row[1] == 1 and row[3] == pytest.approx(42)
        assert row[6] is None  # SD undefined for n=1

    def test_all_missing_column(self):
        ds = make_dataset({"x": [None, None, None]})
        r = run("descriptives", ds, {"variables": ["x"]})
        assert r.tables[0].rows[0][1] == 0

    def test_user_missing_values_excluded(self):
        ds = DatasetPayload(
            variables=[VariableMeta(name="x", var_type="numeric", measure="scale", missing_values=[99])],
            rows=[{"x": 1}, {"x": 2}, {"x": 99}],
        )
        r = run("descriptives", ds, {"variables": ["x"]})
        row = r.tables[0].rows[0]
        assert row[1] == 2 and row[3] == pytest.approx(1.5)
