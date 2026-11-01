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


def _baskets(frame: pd.DataFrame) -> dict[int, set[int]]:
    return {int(order_id): set(group["product_id"].dropna().astype(int)) for order_id, group in frame.groupby("order_id")}


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
    return {
        "heatmap": [{"day": int(day), "hour": int(hour), "orders": int(value)} for (day, hour), value in day_hour.items()],
        "reorders": [{"reordered": int(flag), "items": int(value)} for flag, value in reorder.items()],
        "daysSincePriorOrder": [{"days": int(days), "items": int(value)} for days, value in timing.items()],
        "basketSizes": [{"size": len(items), "orders": 1} for items in baskets.values()],
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


def _network(rules: list[dict[str, Any]], lookup: dict[int, dict[str, Any]]) -> dict[str, Any]:
    edge_map: dict[tuple[int, int], dict[str, Any]] = {}
    for rule in rules:
        antecedents = [item["productId"] for item in rule["antecedent"]]
        consequents = [item["productId"] for item in rule["consequent"]]
        for source, target in combinations(antecedents + consequents, 2):
            pair = tuple(sorted((source, target)))
            edge_map[pair] = {"source": pair[0], "target": pair[1], "support": rule["support"], "lift": rule["lift"], "confidence": max(rule["confidence"], edge_map.get(pair, {}).get("confidence", 0)), "orders": rule["orders"]}
    ids = {product_id for pair in edge_map for product_id in pair}
    return {"nodes": [{"id": product_id, "label": lookup[product_id]["product_name"], "department": lookup[product_id]["department"]} for product_id in sorted(ids)], "edges": list(edge_map.values())}


def _reliability(frame: pd.DataFrame, rules: list[dict[str, Any]], parameters: dict[str, Any]) -> dict[str, Any]:
    users = frame["user_id"].dropna().unique()
    split = int(len(users) * 0.8)
    return {
        "status": "available" if len(rules) else "insufficient_rules",
        "method": "order-level association rules with user-disjoint holdout reserved for runtime evaluation",
        "trainUsers": split,
        "testUsers": len(users) - split,
        "ruleCount": len(rules),
        "parameters": parameters,
        "baseline": {"name": "popularity", "hitRateAtK": None},
        "model": {"name": "association rules", "hitRateAtK": None},
        "note": "Full holdout scoring is represented as null until a recommendation k is requested by the backend.",
    }


def build_payload(frame: pd.DataFrame, quality: dict[str, Any] | None = None, *, min_support: float = 0.005, min_confidence: float = 0.1) -> dict[str, Any]:
    """Build the complete JSON-ready payload consumed by future backend routes."""
    frame = frame.copy()
    baskets = _baskets(frame)
    lookup = _product_lookup(frame)
    parameters = {"minSupport": min_support, "minConfidence": min_confidence, "maxItemsetLength": 3, "basketDefinition": "order"}
    rules, trace = _rules(baskets, lookup, min_support, min_confidence, max_len=3)
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
        "reliability": _reliability(frame, rules, parameters),
        "howItWorks": {"algorithm": "Apriori", "trace": trace, "passes": [{"length": int(length), "itemsets": count} for length, count in trace.get("itemsetsByLength", {}).items()]},
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