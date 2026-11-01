# CartSense mock data

`cart-sense-orders.csv` is a small grocery-order dataset for testing the upload and analysis screens.

It contains:

- 14 order IDs across 5 customers, including repeat orders.
- Day-of-week values from `0` (Sunday) through `6` (Saturday).
- Order hour, days since prior order, product, department, reorder flag, and cart position.
- Repeated baskets that create useful pairings such as milk + eggs, yogurt + granola, and pasta + tomato sauce.
- Cross-department combinations for bundle and department analysis.
- One intentionally invalid row with a missing `order_id`, useful for testing skipped-row validation.

Use the first row as the column-mapping source in the Upload & Data Check screen. The CSV is served from `/mock-data/cart-sense-orders.csv` when running the Vite app.
