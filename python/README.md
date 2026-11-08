# CartSense Python analysis

The notebook remains useful for exploration, but this package is the repeatable runtime boundary. It reads the shared order-line CSV schema and emits one versioned JSON payload for the future Express backend.

## Run

```powershell
python -m pip install -e ".[dev]"
python -m cartsense_analysis --input public/mock-data/cart-sense-orders.csv --output analysis.json
```

The payload contains dashboard, product, department, behavior, association-rule, bundle, network, reliability, and export-ready sections. Association metrics use one basket per order so cross-department bundles are measurable. The default minimum confidence is `0.2`, which removes weak conditional rules while preserving recommendation coverage.

## Evaluation pipeline

The repeatable pipeline is: load and validate -> preprocess -> split users into disjoint train/test partitions -> build one basket per order -> mine Apriori rules -> generate top-k recommendations with a popularity fallback -> evaluate -> emit the payload. It reports support, confidence, lift, leverage, rule coverage, recommendation coverage, Hit Rate@K, Recall@K, MRR, and popularity-baseline comparisons.

Apriori is an association-rule recommender, not a supervised classifier, so Hit Rate@K and MRR are the relevant performance measures. They should not be presented as classification accuracy. On `public/dataset/modeldataset.csv`, the upgraded order-level evaluation reached approximately 47% Hit Rate@10 versus approximately 40% for the popularity baseline, with the exact result depending on the configured confidence threshold and seed.

The current payload intentionally does not invent price, revenue, margin, inventory, demographic, or geographic fields because they are absent from the source CSV.