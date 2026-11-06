import { useEffect, useState } from 'react'
import { getAnalysisPayload } from '../api'
import '../style/executive-dashboard.css'

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatNumber(value) {
  return Number(value || 0).toLocaleString()
}

function DashboardMessage({ children, action }) {
  return (
    <div className="chart-card" role="status">
      <p>{children}</p>
      {action}
    </div>
  )
}

export default function ExecutiveDashboard({ onNavigate }) {
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    function loadPayload() {
      setLoading(true)
      setError('')
      return getAnalysisPayload()
        .then((nextPayload) => {
          if (active) setPayload(nextPayload)
        })
        .catch((requestError) => {
          if (active) setError(requestError.message || 'Could not load the analysis payload.')
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }

    loadPayload()
    window.addEventListener('cartsense:payload-updated', loadPayload)

    return () => {
      active = false
      window.removeEventListener('cartsense:payload-updated', loadPayload)
    }
  }, [])

  const ordersByDay = Array.isArray(payload?.dashboard?.ordersByDay) ? payload.dashboard.ordersByDay : []
  const topProducts = Array.isArray(payload?.dashboard?.topProducts) ? payload.dashboard.topProducts : []
  const hasDashboardData = ordersByDay.length > 0 || topProducts.length > 0
  const maxOrdersByDay = Math.max(...ordersByDay.map((day) => Number(day.orders) || 0), 1)
  const maxProductOrders = Math.max(...topProducts.map((product) => Number(product.orders) || 0), 1)

  if (loading) {
    return (
      <section className="dashboard-screen" aria-labelledby="dashboard-title">
        <header className="dashboard-header">
          <div>
            <h1 id="dashboard-title">Executive Dashboard</h1>
            <p>A quick read of the uploaded grocery orders.</p>
          </div>
        </header>
        <DashboardMessage>Loading dashboard data...</DashboardMessage>
      </section>
    )
  }

  if (error) {
    return (
      <section className="dashboard-screen" aria-labelledby="dashboard-title">
        <header className="dashboard-header">
          <div>
            <h1 id="dashboard-title">Executive Dashboard</h1>
            <p>A quick read of the uploaded grocery orders.</p>
          </div>
        </header>
        <DashboardMessage>Unable to load dashboard data: {error}</DashboardMessage>
      </section>
    )
  }

  if (!hasDashboardData) {
    return (
      <section className="dashboard-screen" aria-labelledby="dashboard-title">
        <header className="dashboard-header">
          <div>
            <h1 id="dashboard-title">Executive Dashboard</h1>
            <p>A quick read of the uploaded grocery orders.</p>
          </div>
        </header>
        <DashboardMessage
          action={
            <button className="dashboard-upload-button" type="button" onClick={() => onNavigate?.('upload')}>
              Upload data
            </button>
          }
        >
          No analysis is available yet. Upload a CSV first to generate your executive dashboard.
        </DashboardMessage>
      </section>
    )
  }

  const summary = payload.summary || {}

  return (
    <section className="dashboard-screen" aria-labelledby="dashboard-title">
      <header className="dashboard-header">
        <div>
          <h1 id="dashboard-title">Executive Dashboard</h1>
          <p>A quick read of the uploaded grocery orders.</p>
        </div>
        <span className="data-status">Live data · {formatNumber(summary.orders)} orders</span>
      </header>

      <div className="dashboard-kpis">
        <article className="kpi-card">
          <span>Orders</span>
          <strong>{formatNumber(summary.orders)}</strong>
        </article>
        <article className="kpi-card">
          <span>Customers</span>
          <strong>{formatNumber(summary.customers)}</strong>
        </article>
        <article className="kpi-card">
          <span>Products</span>
          <strong>{formatNumber(summary.products)}</strong>
        </article>
        <article className="kpi-card">
          <span>Reorder rate</span>
          <strong>{summary.reorderRate ?? 0}%</strong>
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
            {ordersByDay.map((day) => {
              const value = Number(day.orders) || 0
              return (
                <div className="bar-column" key={day.day}>
                  <span className="bar-value">{value}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ height: `${(value / maxOrdersByDay) * 100}%` }} />
                  </div>
                  <span className="bar-label">{dayLabels[Number(day.day)] ?? day.day}</span>
                </div>
              )
            })}
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
            {topProducts.map((product) => {
              const value = Number(product.orders) || 0
              return (
                <div className="horizontal-bar" key={product.productId ?? product.productName}>
                  <div className="horizontal-bar-meta">
                    <span>{product.productName}</span>
                    <strong>{value}</strong>
                  </div>
                  <div className="horizontal-track">
                    <div className="horizontal-fill" style={{ width: `${(value / maxProductOrders) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </article>
      </div>
    </section>
  )
}
