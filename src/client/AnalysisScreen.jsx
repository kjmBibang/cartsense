import { useEffect, useMemo, useState } from 'react'
import { getAnalysisPayload } from './api.js'
import { formatAnalysisValue } from './analysisUtils.js'
import './style/analysis-data.css'

const EMPTY_ROWS = []
const TABLE_HEADER_HELP = {
  rank: 'Position after sorting the rows by the table\'s current ranking.',
  sourceProduct: 'The product at the starting point of the observed relationship.',
  targetProduct: 'The product observed in the same basket relationship as the source product.',
  antecedentProductName: 'The product customers bought first in this association rule.',
  consequentProductName: 'The product customers also bought in this association rule.',
  productName: 'The name of the product in this row.',
  department: 'The grocery department assigned to the product.',
  orders: 'The number of distinct orders containing this row or relationship.',
  items: 'The number of item rows counted in this group.',
  units: 'The number of product units recorded in this group.',
  products: 'The number of distinct products in this group.',
  support: 'The share of baskets containing the relationship.',
  confidence: 'The chance of the consequent product when the antecedent product appears.',
  lift: 'How much more often the relationship appears than independent purchasing would predict.',
  reorderRate: 'The percentage of recorded items marked as reordered.',
  averageCartPosition: 'The average position of this product in the cart.',
  sizeLabel: 'The number of items contained in each basket-size group.',
  field: 'The source field being checked.',
  count: 'The number of records counted for this field.',
  row: 'The source CSV row where the issue was found.',
  column: 'The source CSV column associated with the issue.',
  message: 'The validation issue reported for the source row.',
  length: 'The number of products in the itemset.',
  itemsets: 'The number of frequent itemsets at this length.',
}

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

export function MetricCard({ label, value, description, onClick, actionLabel }) {
  const content = <>
    <span>{label}{description && <InfoTip text={description} />}</span>
    <strong>{value ?? '—'}</strong>
  </>
  return (
    onClick
      ? <button className="analysis-metric analysis-metric-action" type="button" onClick={onClick} aria-label={actionLabel || `${label}: open more detail`}>{content}</button>
      : <article className="analysis-metric">{content}</article>
  )
}

export function EmptyState({ children }) {
  return <p className="analysis-empty" role="status">{children}</p>
}

export function AnalysisPanel({ title, description, children, className = '', titleHelp, action }) {
  return (
    <section className={`analysis-card ${className}`.trim()}>
      <div className="analysis-panel-heading">
        <div>
          <h2>{title}{titleHelp && <InfoTip text={titleHelp} />}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function InfoTip({ text }) {
  return <span className="analysis-info-tip" tabIndex="0" aria-label={text}>
    <span aria-hidden="true">?</span>
    <span className="analysis-tooltip" role="tooltip">{text}</span>
  </span>
}

export function ScreenLink({ children = 'View details', onNavigate, target, className = '' }) {
  return <button className={`analysis-detail-link ${className}`.trim()} type="button" onClick={() => onNavigate?.(target)}>
    {children} <span aria-hidden="true">→</span>
  </button>
}

export function DetailDisclosure({ title = 'Why this matters', children }) {
  return <details className="analysis-detail-disclosure">
    <summary>{title}</summary>
    <div>{children}</div>
  </details>
}

export function HorizontalBarChart({
  rows,
  labelKey,
  valueKey,
  label = 'Comparison chart',
  valueFormat = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }),
  onNavigate,
  target,
  detailLabel = 'View related details',
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
      {onNavigate && target && <ScreenLink onNavigate={onNavigate} target={target}>{detailLabel}</ScreenLink>}
    </div>
  )
}

export function DataTable({ columns, rows, searchable = true, searchLabel = 'Search this table', toolbarAction = null }) {
  const safeRows = Array.isArray(rows) ? rows : EMPTY_ROWS
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: '', direction: 'ascending' })
  const [page, setPage] = useState(1)
  const [collapsed, setCollapsed] = useState(false)
  const pageSize = 50
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

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visibleRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const changeQuery = (value) => {
    setQuery(value)
    setPage(1)
  }

  return (
    <>
      <div className="analysis-table-toolbar">
        {searchable && (
          <label className="analysis-table-search">
            <span>{searchLabel}</span>
            <input type="search" value={query} onChange={(event) => changeQuery(event.target.value)} />
          </label>
        )}
        {toolbarAction}
        <button className="analysis-table-collapse" type="button" onClick={() => setCollapsed((current) => !current)} aria-expanded={!collapsed}>
          {collapsed ? 'Show table' : 'Collapse table'}
        </button>
      </div>
      {!collapsed && (!filteredRows.length
        ? <EmptyState>No rows match this search.</EmptyState>
        : <div className="analysis-table-wrap">
          <table className="analysis-table">
            <thead>
              <tr>
                {columns.map(([key, heading, description]) => (
                  <th key={key} scope="col" aria-sort={sort.key === key ? sort.direction : 'none'}>
                    <button
                      type="button"
                      className="analysis-sort-button"
                      onClick={() => {
                        setPage(1)
                        setSort((current) => ({
                          key,
                          direction: current.key === key && current.direction === 'ascending' ? 'descending' : 'ascending',
                        }))
                      }}
                    >
                      <span title={description || TABLE_HEADER_HELP[key] || `${heading} column`}>{heading}</span>
                      <span aria-hidden="true">{sort.key === key ? (sort.direction === 'ascending' ? ' ↑' : ' ↓') : ' ↕'}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={row.id ?? row.productId ?? row.productName ?? `${row.antecedentProductName ?? ''}-${row.consequentProductName ?? ''}-${(currentPage - 1) * pageSize + index}`}>
                  {columns.map(([key]) => <td key={key}>{formatAnalysisValue(key, row[key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="analysis-table-pagination" aria-label="Table pagination">
            <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
            <span>Page {currentPage} of {pageCount} · {filteredRows.length.toLocaleString()} rows</span>
            <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
          </div>
        </div>)}
    </>
  )
}
