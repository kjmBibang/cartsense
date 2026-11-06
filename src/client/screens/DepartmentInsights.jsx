import AnalysisScreen, { AnalysisPanel, DataTable, EmptyState, HorizontalBarChart, MetricCard } from '../AnalysisScreen.jsx'
import '../style/department-insights.css'

export default function DepartmentInsights() {
  return (
    <AnalysisScreen title="Department Insights" description="Compare department reach, item volume, assortment breadth, and repeat purchasing to guide account-level follow-up.">
      {(payload) => {
        const rows = Array.isArray(payload.departments?.rows) ? payload.departments.rows : []
        const rankedRows = [...rows].sort((a, b) => (Number(b.orders) || 0) - (Number(a.orders) || 0))
        const reorderRows = [...rows]
          .filter((row) => row.reorderRate !== null && row.reorderRate !== undefined)
          .sort((a, b) => (Number(b.reorderRate) || 0) - (Number(a.reorderRate) || 0))
        const leading = rankedRows[0]
        const lowerVolume = rankedRows.length > 1 ? rankedRows[rankedRows.length - 1] : null
        const chartRows = rankedRows.slice(0, 10)

        return <>
          <div className="analysis-grid">
            <MetricCard label="Departments represented" value={rows.length.toLocaleString()} />
            <MetricCard label="Highest order reach" value={leading?.department ?? '—'} />
            <MetricCard label="Highest reorder rate" value={reorderRows[0] ? `${reorderRows[0].department} · ${Number(reorderRows[0].reorderRate).toLocaleString(undefined, { maximumFractionDigits: 1 })}%` : '—'} />
          </div>
          <AnalysisPanel title="Department order comparison" description="Orders indicate the number of baskets containing products from each department. Departments may overlap within an order.">
            <HorizontalBarChart rows={chartRows} labelKey="department" valueKey="orders" label="Departments ranked by orders" />
          </AnalysisPanel>
          {rows.length > 0 && <div className="analysis-insight-strip">
            <p><strong>Leading reach:</strong> {leading.department} appears in {Number(leading.orders).toLocaleString()} orders across {Number(leading.products).toLocaleString()} products.</p>
            {lowerVolume && <p><strong>Lower observed reach:</strong> {lowerVolume.department} appears in {Number(lowerVolume.orders).toLocaleString()} orders. This is a relative volume signal, not proof of underperformance; check assortment and coverage before acting.</p>}
          </div>}
          <AnalysisPanel title="Department comparison" description="The full comparison keeps orders, item volume, assortment size, and reorder behavior visible together.">
            {rows.length
              ? <DataTable
                searchLabel="Search departments"
                columns={ [['department', 'Department'], ['orders', 'Orders'], ['items', 'Items'], ['products', 'Products'], ['reorderRate', 'Reorder rate']] }
                rows={rankedRows}
              />
              : <EmptyState>No department rows are available for this analysis.</EmptyState>}
          </AnalysisPanel>
        </>
      }}
    </AnalysisScreen>
  )
}
