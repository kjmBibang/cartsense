# CartSense Python analysis

The notebook remains useful for exploration, but this package is the repeatable runtime boundary. It reads the shared order-line CSV schema and emits one versioned JSON payload for the future Express backend.

## Run

```powershell
python -m pip install -e ".[dev]"
python -m cartsense_analysis --input public/mock-data/cart-sense-orders.csv --output analysis.json
```

The payload contains dashboard, product, department, behavior, association-rule, bundle, network, reliability, and export-ready sections. Association metrics use one basket per order so cross-department bundles are measurable.

The current payload intentionally does not invent price, revenue, margin, inventory, demographic, or geographic fields because they are absent from the source CSV.