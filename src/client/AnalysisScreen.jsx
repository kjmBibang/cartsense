import { useEffect, useMemo, useState } from 'react'
import { getAnalysisPayload } from './api.js'
import { formatAnalysisValue } from './analysisUtils.js'
import './style/analysis-data.css'

const EMPTY_ROWS = []

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
      <strong>{value ?? '—'}</strong>
    </article>
  )
}

export function EmptyState({ children }) {
  return <p className="analysis-empty" role="status">{children}</p>
}

export function AnalysisPanel({ title, description, children, className = '' }) {
  return (
    <section className={`analysis-card ${className}`.trim()}>
      <div className="analysis-panel-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

export function HorizontalBarChart({
  rows,
  labelKey,
  valueKey,
  label = 'Comparison chart',
  valueFormat = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }),
}) {
  const values = Array.isArray(rows) ? rows : []
  if (!values.length) return <EmptyState>No comparable data is available for this chart.</EmptyState>
  const maxValue = Math.max(...values.map((row) => Number(row[valueKey]) || 0))

  return (
    <div className="analysis-bars" role="group" aria-label={label}>
      {values.map((row, index) => {
        const value = Number(row[valueKey]) || 0
        const width = maxValue > 0 ? (value / maxValue) * 100 : 0
        return (
          <div className="analysis-bar-row" key={row.id ?? row.productId ?? row.department ?? row[labelKey] ?? index}>
            <span className="analysis-bar-label" title={row[labelKey]}>{row[labelKey] ?? '—'}</span>
            <div className="analysis-bar-track" aria-hidden="true">
              <span className="analysis-bar-fill" style={{ width: `${width}%` }} />
            </div>
            <strong className="analysis-bar-value">{valueFormat(value, row)}</strong>
          </div>
        )
      })}
    </div>
  )
}

export function DataTable({ columns, rows, searchable = true, searchLabel = 'Search this table' }) {
  const safeRows = Array.isArray(rows) ? rows : EMPTY_ROWS
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: '', direction: 'ascending' })
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const matches = normalizedQuery
      ? safeRows.filter((row) => columns.some(([key]) => String(row[key] ?? '').toLocaleLowerCase().includes(normalizedQuery)))
      : safeRows
    if (!sort.key) return matches
    const direction = sort.direction === 'ascending' ? 1 : -1
    return [...matches].sort((left, right) => {
      const leftValue = left[sort.key]
      const rightValue = right[sort.key]
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return (leftValue - rightValue) * direction
      }
      return String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, { numeric: true }) * direction
    })
  }, [columns, query, safeRows, sort])

  if (!safeRows.length) return <EmptyState>No rows are available for this section.</EmptyState>

  return (
    <>
      {searchable && (
        <label className="analysis-table-search">
          <span>{searchLabel}</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      )}
      {!filteredRows.length
        ? <EmptyState>No rows match this search.</EmptyState>
        : <div className="analysis-table-wrap">
          <table className="analysis-table">
            <thead>
              <tr>
                {columns.map(([key, heading]) => (
                  <th key={key} scope="col" aria-sort={sort.key === key ? sort.direction : 'none'}>
                    <button
                      type="button"
                      className="analysis-sort-button"
                      onClick={() => setSort((current) => ({
                        key,
                        direction: current.key === key && current.direction === 'ascending' ? 'descending' : 'ascending',
                      }))}
                    >
                      {heading}
                      <span aria-hidden="true">{sort.key === key ? (sort.direction === 'ascending' ? ' ↑' : ' ↓') : ' ↕'}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.slice(0, 250).map((row, index) => (
                <tr key={row.id ?? row.productId ?? row.productName ?? `${row.antecedentProductName ?? ''}-${row.consequentProductName ?? ''}-${index}`}>
                  {columns.map(([key]) => <td key={key}>{formatAnalysisValue(key, row[key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRows.length > 250 && <p className="analysis-table-note">Showing the first 250 matching rows. Refine the search to narrow the results.</p>}
        </div>}
    </>
  )
}
