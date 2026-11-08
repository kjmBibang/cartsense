import json

from cartsense_analysis.analysis import build_order_baskets, build_payload, evaluate_recommendations, load_orders, mine_association_rules, split_users


def test_mock_upload_reports_invalid_row_and_emits_screen_sections():
    frame, quality = load_orders("public/mock-data/cart-sense-orders.csv")
    payload = build_payload(frame, quality, min_support=0.05, min_confidence=0.1)

    assert quality["totalRows"] == 71
    assert quality["invalidRows"] == 1
    assert payload["summary"]["orders"] == 14
    assert payload["summary"]["customers"] == 5
    assert sum(row["orders"] for row in payload["behavior"]["basketSizes"]) == payload["summary"]["orders"]
    assert max(edge["lift"] for edge in payload["network"]["edges"]) == max(rule["lift"] for rule in payload["patterns"]["rules"])
    assert payload["network"]["nodes"]
    assert payload["bundles"]["rules"]
    json.dumps(payload, allow_nan=False)


def test_order_level_pair_metrics_are_directional():
    frame, quality = load_orders("public/mock-data/cart-sense-orders.csv")
    payload = build_payload(frame, quality, min_support=0.1, min_confidence=0.1)
    rules = payload["patterns"]["rules"]
    milk_to_eggs = next(rule for rule in rules if rule["antecedentProductName"] == "Whole Milk" and rule["consequentProductName"] == "Large Eggs")

    assert milk_to_eggs["orders"] == 5
    assert milk_to_eggs["support"] == round(5 / 14, 6)
    assert milk_to_eggs["confidence"] > 0
    assert milk_to_eggs["lift"] > 0


def test_evaluation_split_is_user_disjoint_and_metrics_are_finite():
    frame, _quality = load_orders("public/mock-data/cart-sense-orders.csv")
    train, test = split_users(frame, seed=42)
    assert set(train["user_id"]).isdisjoint(set(test["user_id"]))

    rules, _trace = mine_association_rules(train, min_support=0.05, min_confidence=0.1)
    metrics = evaluate_recommendations(train, test, rules, ks=(1, 3, 5), seed=42)

    assert metrics["ordersEvaluated"] > 0
    assert 0 <= metrics["ruleCoverage"] <= 100
    for model in (metrics["popularityBaseline"], metrics["rules"], metrics["rulesWithPopularityFallback"]):
        assert all(value == value for value in model.values())


def test_order_baskets_keep_products_from_multiple_departments_together():
    frame, _quality = load_orders("public/mock-data/cart-sense-orders.csv")
    baskets = build_order_baskets(frame)
    sample_order = frame["order_id"].iloc[0]
    sample_products = set(frame.loc[frame["order_id"] == sample_order, "product_id"].astype(int))
    assert baskets[int(sample_order)] == sample_products