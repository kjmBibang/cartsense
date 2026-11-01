import json

from cartsense_analysis.analysis import build_payload, load_orders


def test_mock_upload_reports_invalid_row_and_emits_screen_sections():
    frame, quality = load_orders("public/mock-data/cart-sense-orders.csv")
    payload = build_payload(frame, quality, min_support=0.05, min_confidence=0.1)

    assert quality["totalRows"] == 71
    assert quality["invalidRows"] == 1
    assert payload["summary"]["orders"] == 14
    assert payload["summary"]["customers"] == 5
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