import '../style/executive-dashboard.css'

const orderDays = [
  { label: 'Sun', value: 1 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 3 },
  { label: 'Wed', value: 1 },
  { label: 'Thu', value: 2 },
  { label: 'Fri', value: 2 },
  { label: 'Sat', value: 4 },
]

const topProducts = [
  { label: 'Whole Milk', value: 10 },
  { label: 'Bananas', value: 6 },
  { label: 'Large Eggs', value: 6 },
  { label: 'Whole Wheat Bread', value: 5 },
  { label: 'Tomato Sauce', value: 3 },
]

export default function ExecutiveDashboard() {
  return (
    <section className="dashboard-screen" aria-labelledby="dashboard-title">
      <header className="dashboard-header">
        <div>
          <span className="screen-number">Screen 02</span>
          <h1 id="dashboard-title">Executive Dashboard</h1>
          <p>A quick read of the uploaded grocery orders.</p>
        </div>
        <span className="data-status">Mock data · 14 orders</span>
      </header>

      <div className="dashboard-kpis">
        <article className="kpi-card">
          <span>Orders</span>
          <strong>14</strong>
        </article>
        <article className="kpi-card">
          <span>Customers</span>
          <strong>5</strong>
        </article>
        <article className="kpi-card">
          <span>Products</span>
          <strong>25</strong>
        </article>
        <article className="kpi-card">
          <span>Reorder rate</span>
          <strong>51%</strong>
        </article>
      </div>

      <div className="dashboard-charts">
        <article className="chart-card">
          <div className="chart-heading">
            <div>
              <h2>Orders by day</h2>
              <p>When customers place orders</p>
            </div>
            <span>orders</span>
          </div>
          <div className="bar-chart" aria-label="Orders by day bar chart">
            {orderDays.map((day) => (
              <div className="bar-column" key={day.label}>
                <span className="bar-value">{day.value}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ height: `${(day.value / 4) * 100}%` }} />
                </div>
                <span className="bar-label">{day.label}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="chart-card">
          <div className="chart-heading">
            <div>
              <h2>Top products</h2>
              <p>Most frequently seen in baskets</p>
            </div>
            <span>rows</span>
          </div>
          <div className="horizontal-bars" aria-label="Top products bar chart">
            {topProducts.map((product) => (
              <div className="horizontal-bar" key={product.label}>
                <div className="horizontal-bar-meta">
                  <span>{product.label}</span>
                  <strong>{product.value}</strong>
                </div>
                <div className="horizontal-track">
                  <div className="horizontal-fill" style={{ width: `${(product.value / 10) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}
