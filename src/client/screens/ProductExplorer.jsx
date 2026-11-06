import { useState } from 'react'
import AnalysisScreen, { AnalysisPanel, DataTable, EmptyState, HorizontalBarChart, MetricCard } from '../AnalysisScreen.jsx'
import '../style/product-explorer.css'

export default function ProductExplorer() {
  const [department, setDepartment] = useState('')
  const [reorderFilter, setReorderFilter] = useState('')

  return (
    <AnalysisScreen title="Product Explorer" description="Find high-reach products, repeat-purchase signals, and department-specific opportunities for follow-up.">
      {(payload) => {
        const products = Array.isArray(payload.products) ? payload.products : []
        const departments = [...new Set(products.map((product) => product.department).filter(Boolean))].sort((a, b) => a.localeCompare(b))
        const topProducts = [...products]
          .sort((a, b) => (Number(b.orders) || 0) - (Number(a.orders) || 0))
          .slice(0, 10)
        const filteredProducts = products
          .filter((product) => !department || product.department === department)
          .filter((product) => {
            if (reorderFilter === 'reordered') return Number(product.reorderRate) > 0
            if (reorderFilter === 'not-reordered') return product.reorderRate != null && Number(product.reorderRate) === 0
            return true
          })
          .sort((a, b) => (Number(b.orders) || 0) - (Number(a.orders) || 0))
          .map((product, index) => ({ ...product, rank: index + 1 }))
        const rowsWithReorderData = products.filter((product) => product.reorderRate !== null && product.reorderRate !== undefined)
        const reorderFilterAvailable = rowsWithReorderData.length > 0
        const tableRows = filteredProducts.map((product) => ({
          ...product,
          averageCartPosition: product.averageCartPosition == null ? '—' : product.averageCartPosition,
        }))

        return <>
          <div className="analysis-grid">
            <MetricCard label="Products in analysis" value={products.length.toLocaleString()} />
            <MetricCard label="Orders analyzed" value={payload.summary?.orders?.toLocaleString() ?? '—'} />
            <MetricCard label="Distinct departments" value={departments.length.toLocaleString()} />
          </div>
          <AnalysisPanel title="Top products by orders" description="Products appearing in more orders may warrant availability protection or placement support.">
            <HorizontalBarChart rows={topProducts} labelKey="productName" valueKey="orders" label="Top products ranked by number of orders" />
          </AnalysisPanel>
          <AnalysisPanel title="Product performance" description="Use order reach, units, reorder rate, and cart position together to prioritize follow-up.">
            <div className="analysis-filters">
              <label>
                <span>Department</span>
                <select value={department} onChange={(event) => setDepartment(event.target.value)}>
                  <option value="">All departments</option>
                  {departments.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>
                <span>Repeat purchase</span>
                <select value={reorderFilter} onChange={(event) => setReorderFilter(event.target.value)} disabled={!reorderFilterAvailable}>
                  <option value="">All products</option>
                  <option value="reordered">Has reorders</option>
                  <option value="not-reordered">No reorders</option>
                </select>
              </label>
            </div>
            {products.length
              ? <DataTable
                searchLabel="Search products"
                columns={ [['rank', 'Rank in filter'], ['productName', 'Product'], ['department', 'Department'], ['orders', 'Orders'], ['units', 'Units'], ['reorderRate', 'Reorder rate'], ['averageCartPosition', 'Avg. cart position']] }
                rows={tableRows}
              />
              : <EmptyState>No product rows are available in this payload.</EmptyState>}
            {products.length > 0 && !reorderFilterAvailable && <p className="analysis-footnote">Reorder filtering is unavailable because the payload has no product reorder values.</p>}
          </AnalysisPanel>
        </>
      }}
    </AnalysisScreen>
  )
}
