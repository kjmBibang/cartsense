"""Pure analysis functions used to create the CartSense frontend payload."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from mlxtend.frequent_patterns import apriori, association_rules
from mlxtend.preprocessing import TransactionEncoder

REQUIRED_COLUMNS = {"order_id", "user_id", "product_id", "product_name", "department"}
NUMERIC_COLUMNS = ["order_id", "user_id", "order_number", "order_dow", "order_hour_of_day", "days_since_prior_order", "product_id", "add_to_cart_order", "reordered", "department_id"]
DEFAULT_KS = (1, 3, 5, 10)


def load_orders(path: str | Path) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Load and validate order lines while preserving row-level diagnostics."""
    frame = pd.read_csv(path, dtype=str, keep_default_na=False)
    missing_columns = sorted(REQUIRED_COLUMNS - set(frame.columns))
    if missing_columns:
        raise ValueError(f"Missing required columns: {', '.join(missing_columns)}")

    errors: list[dict[str, Any]] = []
    valid = pd.Series(True, index=frame.index)
    for column in ("order_id", "user_id", "product_id"):
        values = pd.to_numeric(frame[column], errors="coerce")
        invalid = values.isna() | (values % 1 != 0)
        for index in frame.index[invalid]:
            errors.append({"row": int(index) + 2, "column": column, "message": "must be an integer"})
        valid &= ~invalid

    for column in ("product_name", "department"):
        invalid = frame[column].astype(str).str.strip().eq("")
        for index in frame.index[invalid]:
            errors.append({"row": int(index) + 2, "column": column, "message": "is required"})
        valid &= ~invalid

    for column, low, high in (("order_dow", 0, 6), ("order_hour_of_day", 0, 23)):
        values = pd.to_numeric(frame[column], errors="coerce")
        invalid = frame[column].ne("") & (values.isna() | (values % 1 != 0) | (values < low) | (values > high))
        for index in frame.index[invalid]:
            errors.append({"row": int(index) + 2, "column": column, "message": f"must be an integer from {low} to {high}"})
        valid &= ~invalid

    clean = frame.loc[valid].copy()
    for column in NUMERIC_COLUMNS:
        if column not in clean:
            clean[column] = np.nan
        else:
            clean[column] = pd.to_numeric(clean[column], errors="coerce")
    clean["product_name"] = clean["product_name"].str.strip()
    clean["department"] = clean["department"].str.strip()
    clean["reordered"] = clean["reordered"].fillna(0).clip(0, 1)

    quality = {
        "source": str(path),
        "totalRows": int(len(frame)),
        "validRows": int(len(clean)),
        "invalidRows": int(len(frame) - len(clean)),
        "validationErrors": errors,
        "missingValues": {column: int(clean[column].isna().sum()) for column in clean.columns if clean[column].isna().any()},
    }
    return clean, quality


def _records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    return frame.to_dict(orient="records")


def build_order_baskets(frame: pd.DataFrame) -> dict[int, set[int]]:
    return {int(order_id): set(group["product_id"].dropna().astype(int)) for order_id, group in frame.groupby("order_id")}


def split_users(frame: pd.DataFrame, *, test_size: float = 0.2, seed: int = 42) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Split complete users so no customer's orders leak between train and test."""
    if not 0 < test_size < 1:
        raise ValueError("test_size must be between 0 and 1")
    users = frame["user_id"].dropna().unique()
    rng = np.random.default_rng(seed)
    test_count = max(1, int(len(users) * test_size)) if len(users) else 0
    test_users = set(rng.choice(users, size=test_count, replace=False).tolist()) if test_count else set()
    is_test = frame["user_id"].isin(test_users)
    return frame.loc[~is_test].copy(), frame.loc[is_test].copy()


def _product_lookup(frame: pd.DataFrame) -> dict[int, dict[str, Any]]:
    return frame.dropna(subset=["product_id"]).sort_values(["product_id", "product_name"]).drop_duplicates("product_id").set_index("product_id")[["product_name", "department"]].to_dict(orient="index")


def _summary(frame: pd.DataFrame, baskets: dict[int, set[int]]) -> dict[str, Any]:
    basket_sizes = pd.Series([len(items) for items in baskets.values()], dtype=float)
    return {
        "orders": len(baskets),
        "customers": int(frame["user_id"].nunique()),
        "items": len(frame),
        "products": int(frame["product_id"].nunique()),
        "averageBasketSize": round(float(basket_sizes.mean()), 2) if len(basket_sizes) else 0,
        "reorderRate": round(float(frame["reordered"].mean() * 100), 1) if len(frame) else 0,
        "basketSize": {
            "min": int(basket_sizes.min()) if len(basket_sizes) else 0,
            "max": int(basket_sizes.max()) if len(basket_sizes) else 0,
            "median": float(basket_sizes.median()) if len(basket_sizes) else 0,
            "distribution": [{"size": int(size), "orders": int(count)} for size, count in sorted(Counter(basket_sizes).items())],
        },
    }


def _dashboard(frame: pd.DataFrame, lookup: dict[int, dict[str, Any]]) -> dict[str, Any]:
    by_day = frame.dropna(subset=["order_dow"]).groupby("order_dow")["order_id"].nunique()
    by_hour = frame.dropna(subset=["order_hour_of_day"]).groupby("order_hour_of_day")["order_id"].nunique()
    counts = frame.groupby("product_id")["order_id"].nunique().sort_values(ascending=False).head(10)
    return {
        "ordersByDay": [{"day": int(day), "orders": int(value)} for day, value in by_day.items()],
        "ordersByHour": [{"hour": int(hour), "orders": int(value)} for hour, value in by_hour.items()],
        "topProducts": [{"productId": int(product_id), "productName": lookup[int(product_id)]["product_name"], "orders": int(value)} for product_id, value in counts.items()],
    }


def _products(frame: pd.DataFrame) -> list[dict[str, Any]]:
    grouped = frame.groupby(["product_id", "product_name", "department"], dropna=False)
    result = grouped.agg(orders=("order_id", "nunique"), units=("product_id", "size"), reorderRate=("reordered", "mean"), averageCartPosition=("add_to_cart_order", "mean"))
    result = result.sort_values(["orders", "units"], ascending=False).reset_index()
    result["reorderRate"] = (result["reorderRate"] * 100).round(1)
    result["averageCartPosition"] = result["averageCartPosition"].round(2)
    return _records(result.rename(columns={"product_id": "productId", "product_name": "productName"}))


def _departments(frame: pd.DataFrame, baskets: dict[int, set[int]]) -> dict[str, Any]:
    grouped = frame.groupby("department", dropna=False)
    rows = grouped.agg(orders=("order_id", "nunique"), items=("product_id", "size"), products=("product_id", "nunique"), reorderRate=("reordered", "mean")).reset_index()
    rows["reorderRate"] = (rows["reorderRate"] * 100).round(1)
    rows = rows.sort_values("items", ascending=False)
    department_pairs: Counter[tuple[str, str]] = Counter()
    for order_id in baskets:
        names = sorted(frame.loc[frame["order_id"].eq(order_id), "department"].dropna().unique())
        department_pairs.update(combinations(names, 2))
    return {"rows": _records(rows), "coOccurrence": [{"departmentA": a, "departmentB": b, "orders": count} for (a, b), count in department_pairs.most_common()]}


def _behavior(frame: pd.DataFrame, baskets: dict[int, set[int]]) -> dict[str, Any]:
    day_hour = frame.dropna(subset=["order_dow", "order_hour_of_day"]).groupby(["order_dow", "order_hour_of_day"])["order_id"].nunique()
    reorder = frame.groupby("reordered").size()
    timing = frame.dropna(subset=["days_since_prior_order"]).groupby("days_since_prior_order").size()
    basket_size_counts = Counter(len(items) for items in baskets.values())
    return {
        "heatmap": [{"day": int(day), "hour": int(hour), "orders": int(value)} for (day, hour), value in day_hour.items()],
        "reorders": [{"reordered": int(flag), "items": int(value)} for flag, value in reorder.items()],
        "daysSincePriorOrder": [{"days": int(days), "items": int(value)} for days, value in timing.items()],
        "basketSizes": [{"size": int(size), "orders": int(count)} for size, count in sorted(basket_size_counts.items())],
    }


def _rules(baskets: dict[int, set[int]], lookup: dict[int, dict[str, Any]], min_support: float, min_confidence: float, max_len: int = 3) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    transactions = [sorted(items) for items in baskets.values() if items]
    encoder = TransactionEncoder()
    matrix = encoder.fit(transactions).transform(transactions)
    basket_matrix = pd.DataFrame(matrix, columns=encoder.columns_)
    frequent = apriori(basket_matrix, min_support=min_support, use_colnames=True, max_len=max_len)
    if frequent.empty:
        return [], {"basketDefinition": "one basket per order", "basketCount": len(baskets), "minSupport": min_support, "minConfidence": min_confidence, "itemsetCount": 0, "maxItemsetLength": max_len}
    rules_frame = association_rules(frequent, metric="confidence", min_threshold=min_confidence, num_itemsets=len(basket_matrix))
    rows: list[dict[str, Any]] = []
    for rule in rules_frame.itertuples(index=False):
        antecedents = sorted(int(product_id) for product_id in rule.antecedents)
        consequents = sorted(int(product_id) for product_id in rule.consequents)
        rows.append({
            "antecedent": [{"productId": product_id, "productName": lookup[product_id]["product_name"]} for product_id in antecedents],
            "consequent": [{"productId": product_id, "productName": lookup[product_id]["product_name"]} for product_id in consequents],
            "antecedentProductId": antecedents[0] if len(antecedents) == 1 else None,
            "consequentProductId": consequents[0] if len(consequents) == 1 else None,
            "antecedentProductName": lookup[antecedents[0]]["product_name"] if len(antecedents) == 1 else ", ".join(lookup[product_id]["product_name"] for product_id in antecedents),
            "consequentProductName": lookup[consequents[0]]["product_name"] if len(consequents) == 1 else ", ".join(lookup[product_id]["product_name"] for product_id in consequents),
            "support": round(float(rule.support), 6),
            "confidence": round(float(rule.confidence), 6),
            "lift": round(float(rule.lift), 6),
            "leverage": round(float(rule.leverage), 6),
            "orders": round(float(rule.support) * len(baskets)),
        })
    rows.sort(key=lambda row: (-row["lift"], -row["confidence"], -row["support"]))
    return rows, {"basketDefinition": "one basket per order", "basketCount": len(baskets), "minSupport": min_support, "minConfidence": min_confidence, "itemsetCount": len(frequent), "maxItemsetLength": max_len, "itemsetsByLength": {str(length): int(count) for length, count in frequent["itemsets"].map(len).value_counts().items()}}


def mine_association_rules(frame: pd.DataFrame, *, min_support: float = 0.005, min_confidence: float = 0.2, max_len: int = 3) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Mine order-level Apriori rules for an analysis or notebook stage."""
    baskets = build_order_baskets(frame)
    return _rules(baskets, _product_lookup(frame), min_support, min_confidence, max_len=max_len)


def _recommendation_matrix(rules: list[dict[str, Any]], test_baskets: dict[int, set[int]], popularity: dict[int, float], ks: tuple[int, ...], seed: int) -> dict[str, Any]:
    """Hide one product per eligible test order and score rule/fallback recommendations."""
    eligible = [(order_id, sorted(products)) for order_id, products in test_baskets.items() if len(products) >= 2]
    if not eligible:
        return {"ordersEvaluated": 0, "ruleCoverage": 0.0, "recommendationCoverage": 0.0, "rules": {}, "rulesWithPopularityFallback": {}, "popularityBaseline": {}}

    products = sorted({product for _, items in eligible for product in items} | set(popularity))
    product_index = {product: index for index, product in enumerate(products)}
    matrix = np.zeros((len(eligible), len(products)), dtype=bool)
    for row_index, (_order_id, items) in enumerate(eligible):
        matrix[row_index, [product_index[item] for item in items]] = True
    rng = np.random.default_rng(seed)
    hidden_indices = np.array([rng.choice(np.flatnonzero(row)) for row in matrix], dtype=int)
    seen = matrix.copy()
    seen[np.arange(len(eligible)), hidden_indices] = False
    scores = np.zeros(matrix.shape, dtype=np.float32)
    rule_fired = np.zeros(len(eligible), dtype=bool)
    for rule in rules:
        antecedents = [product_index[item["productId"]] for item in rule["antecedent"] if item["productId"] in product_index]
        consequence = [item["productId"] for item in rule["consequent"] if item["productId"] in product_index]
        if not antecedents or not consequence:
            continue
        fires = seen[:, antecedents].all(axis=1)
        rule_fired |= fires
        scores[fires, product_index[consequence[0]]] = np.maximum(scores[fires, product_index[consequence[0]]], float(rule["confidence"]))
    scores[seen] = -np.inf
    popularity_scores = np.array([popularity.get(product, 0.0) for product in products], dtype=np.float32)
    popularity_matrix = np.broadcast_to(popularity_scores, scores.shape)
    def metric_row(rank_scores: np.ndarray, *, require_rule: bool = False) -> dict[str, Any]:
        result = {"coveragePercent": round(100 * (rule_fired.mean() if require_rule else 1.0), 2)}
        for k in ks:
            width = min(k, rank_scores.shape[1])
            top = np.argpartition(-rank_scores, width - 1, axis=1)[:, :width]
            hits = (top == hidden_indices[:, None]).any(axis=1)
            if require_rule:
                hits &= rule_fired
            reciprocal = np.zeros(len(eligible), dtype=float)
            for row_index, candidates in enumerate(top):
                matches = np.flatnonzero(candidates == hidden_indices[row_index])
                if len(matches) and (not require_rule or rule_fired[row_index]): reciprocal[row_index] = 1 / (matches[0] + 1)
            result[f"hitRateAt{k}"] = round(float(hits.mean() * 100), 2)
            result[f"recallAt{k}"] = result[f"hitRateAt{k}"]
            result[f"mrrAt{k}"] = round(float(reciprocal.mean()), 4)
        return result

    hybrid_scores = scores.copy()
    hybrid_scores[scores <= 0] = popularity_matrix[scores <= 0]
    return {
        "ordersEvaluated": len(eligible),
        "ruleCoverage": round(float(rule_fired.mean() * 100), 2),
        "recommendationCoverage": 100.0,
        "rules": metric_row(scores, require_rule=True),
        "rulesWithPopularityFallback": metric_row(hybrid_scores),
        "popularityBaseline": metric_row(popularity_matrix),
    }


def evaluate_recommendations(train: pd.DataFrame, test: pd.DataFrame, rules: list[dict[str, Any]], *, ks: tuple[int, ...] = DEFAULT_KS, seed: int = 42) -> dict[str, Any]:
    train_baskets = build_order_baskets(train)
    test_baskets = build_order_baskets(test)
    train_order_count = max(len(train_baskets), 1)
    popularity = train["product_id"].value_counts(normalize=True).to_dict()
    evaluation = _recommendation_matrix(rules, test_baskets, popularity, ks, seed)
    evaluation["trainOrders"] = len(train_baskets)
    evaluation["testOrders"] = len(test_baskets)
    evaluation["trainUsers"] = int(train["user_id"].nunique())
    evaluation["testUsers"] = int(test["user_id"].nunique())
    evaluation["baseline"] = "Most popular unseen products"
    evaluation["trainOrderFraction"] = round(len(train_baskets) / train_order_count, 4)
    return evaluation


def _network(rules: list[dict[str, Any]], lookup: dict[int, dict[str, Any]]) -> dict[str, Any]:
    edge_map: dict[tuple[int, int], dict[str, Any]] = {}
    for rule in rules:
        antecedents = [item["productId"] for item in rule["antecedent"]]
        consequents = [item["productId"] for item in rule["consequent"]]
        for source, target in combinations(antecedents + consequents, 2):
            pair = tuple(sorted((source, target)))
            current = edge_map.get(pair)
            candidate = {"source": pair[0], "target": pair[1], "support": rule["support"], "lift": rule["lift"], "confidence": rule["confidence"], "orders": rule["orders"]}
            if current is None or (candidate["lift"], candidate["support"], candidate["confidence"]) > (current["lift"], current["support"], current["confidence"]):
                edge_map[pair] = candidate
    ids = {product_id for pair in edge_map for product_id in pair}
    return {"nodes": [{"id": product_id, "label": lookup[product_id]["product_name"], "department": lookup[product_id]["department"]} for product_id in sorted(ids)], "edges": list(edge_map.values())}


def _reliability(frame: pd.DataFrame, rules: list[dict[str, Any]], parameters: dict[str, Any], evaluation: dict[str, Any]) -> dict[str, Any]:
    users = frame["user_id"].dropna().unique()
    split = int(len(users) * 0.8)
    return {
        "status": "available" if len(rules) else "insufficient_rules",
        "method": "order-level association rules with user-disjoint holdout reserved for runtime evaluation",
        "trainUsers": evaluation.get("trainUsers", split),
        "testUsers": evaluation.get("testUsers", len(users) - split),
        "ruleCount": len(rules),
        "parameters": parameters,
        "baseline": {"name": "popularity", **evaluation.get("popularityBaseline", {})},
        "model": {"name": "association rules", **evaluation.get("rulesWithPopularityFallback", {})},
        "evaluation": evaluation,
        "note": "Metrics use a user-disjoint holdout with one hidden product per eligible test order. This is recommendation performance, not classification accuracy.",
    }


def build_payload(frame: pd.DataFrame, quality: dict[str, Any] | None = None, *, min_support: float = 0.005, min_confidence: float = 0.2, max_len: int = 3, evaluation_seed: int = 42, evaluation_ks: tuple[int, ...] = DEFAULT_KS) -> dict[str, Any]:
    """Build the complete JSON-ready payload consumed by future backend routes."""
    frame = frame.copy()
    baskets = build_order_baskets(frame)
    train, test = split_users(frame, seed=evaluation_seed)
    lookup = _product_lookup(frame)
    parameters = {"minSupport": min_support, "minConfidence": min_confidence, "maxItemsetLength": max_len, "basketDefinition": "order", "evaluationSeed": evaluation_seed, "evaluationKs": list(evaluation_ks)}
    train_baskets = build_order_baskets(train)
    train_lookup = _product_lookup(train)
    evaluation_rules, evaluation_trace = _rules(train_baskets, train_lookup, min_support, min_confidence, max_len=max_len)
    rules, trace = _rules(baskets, lookup, min_support, min_confidence, max_len=max_len)
    evaluation = evaluate_recommendations(train, test, evaluation_rules, ks=evaluation_ks, seed=evaluation_seed)
    products = _products(frame)
    payload = {
        "schemaVersion": "1.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": (quality or {}).get("source"),
        "parameters": parameters,
        "dataQuality": quality or {},
        "summary": _summary(frame, baskets),
        "dashboard": _dashboard(frame, lookup),
        "products": products,
        "departments": _departments(frame, baskets),
        "behavior": _behavior(frame, baskets),
        "patterns": {"rules": rules, "count": len(rules)},
        "bundles": {"rules": rules[:100], "count": len(rules)},
        "network": _network(rules, lookup),
        "reliability": _reliability(frame, rules, parameters, evaluation),
        "howItWorks": {"algorithm": "Apriori", "trace": {**trace, "evaluation": evaluation, "trainingTrace": evaluation_trace}, "passes": [{"length": int(length), "itemsets": count} for length, count in trace.get("itemsetsByLength", {}).items()]},
        "exports": {"products": products, "bundles": rules[:100]},
    }
    return _json_safe(payload)


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return None if not np.isfinite(value) else float(value)
    if value is pd.NA or (isinstance(value, float) and not np.isfinite(value)):
        return None
    return value