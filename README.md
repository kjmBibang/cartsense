# CartSense

CartSense is a React/Vite client with an Express API for importing grocery order CSV files and analyzing order-level baskets with MySQL.

## Local setup with XAMPP

1. Start **MySQL** in the XAMPP Control Panel. The default configuration used here is `localhost:3306`, user `root`, with an empty password.
2. In phpMyAdmin, open the SQL tab and run [`server/sql/schema.sql`](server/sql/schema.sql) to create the `cartsense` database and tables.
3. Copy `.env.example` to `.env`. Change `DB_PORT` or `DB_PASSWORD` if your XAMPP installation differs.
4. Install dependencies with `npm install`.
5. Start both applications with `npm run dev:full`.

You can also use two terminals with `npm run server` and `npm run dev`. The API runs on `http://localhost:3001`; Vite runs on `http://localhost:5173` and proxies `/api` requests to the API.

Check the connection at `http://localhost:3001/api/health`. It reports `database: connected` only after MySQL is running and the schema has been created.

## API

- `GET /api/health` checks Express and MySQL.
- `POST /api/uploads/orders` accepts a CSV in the multipart `file` field. Invalid rows are skipped and returned in `validationErrors`; valid rows are imported transactionally.
- `GET /api/analysis/summary?importId=1` returns order, customer, product, basket, reorder, day, and hour metrics.
- `GET /api/analysis/products?importId=1` returns product order counts and reorder rates.
- `GET /api/analysis/departments?importId=1` returns department totals.
- `GET /api/analysis/bundles?importId=1&minSupport=0.05` returns order-level product pairs with support, confidence, and lift.

The sample file at [`public/mock-data/cart-sense-orders.csv`](public/mock-data/cart-sense-orders.csv) contains one intentionally invalid row with a missing `order_id`. The upload screen reports that row while importing the valid rows.

## Python analysis payload

The reusable analysis runtime lives in [`python/cartsense_analysis`](python/cartsense_analysis). It generates a versioned JSON payload for the future backend without requiring a notebook session:

```powershell
python -m pip install -e ".[dev]"
python -m cartsense_analysis --input public/mock-data/cart-sense-orders.csv --output analysis.json
```

The Python package uses one basket per order for Apriori rules, bundles, and network edges. The notebook remains the exploratory reference; the generated payload is the integration boundary for later Express wiring.

## Verification

```bash
npm run lint
npm run build
```
