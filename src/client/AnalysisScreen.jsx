import { useEffect, useState } from 'react'
import { getAnalysisPayload } from './api.js'
import './style/analysis-data.css'

export default function AnalysisScreen({ title, description, children }) {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = () => {
      setLoading(true)
      setError('')
      getAnalysisPayload()
        .then((nextPayload) => {
          if (active) setPayload(nextPayload)
        })
        .catch((requestError) => {
          if (active && requestError.message !== 'Could not load the analysis payload.') setError(requestError.message)
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }
    load()
    window.addEventListener('cartsense:payload-updated', load)
    return () => {
      active = false
      window.removeEventListener('cartsense:payload-updated', load)
    }
  }, [])

  return (
    <section className="analysis-screen" aria-labelledby="analysis-screen-title">
      <header className="analysis-screen-header">
        <div>
          <h1 id="analysis-screen-title">{title}</h1>
          <p>{description}</p>
        </div>
        {payload && <span className="analysis-live-status">Live payload</span>}
      </header>
      {loading && <div className="analysis-message">Loading analysis data...</div>}
      {!loading && error && <div className="analysis-message analysis-error" role="alert">{error}</div>}
      {!loading && !error && !payload && <div className="analysis-message">Upload a CSV to generate this analysis.</div>}
      {!loading && !error && payload && children(payload)}
    </section>
  )
}

export function MetricCard({ label, value }) {
  return (
    <article className="analysis-metric">
      <span>{label}</span>
      <strong>{value ?? 0}</strong>
    </article>
  )
}

export function DataTable({ columns, rows }) {
  return (
    <div className="analysis-table-wrap">
      <table className="analysis-table">
        <thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, 100).map((row, index) => (
            <tr key={row.id ?? row.productId ?? row.productName ?? index}>
              {columns.map(([key]) => <td key={key}>{row[key] ?? '-'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
