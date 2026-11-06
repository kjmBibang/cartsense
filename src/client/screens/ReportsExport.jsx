import AnalysisScreen, { AnalysisPanel, DataTable, EmptyState, MetricCard } from '../AnalysisScreen.jsx'
import '../style/reports-export.css'

function csvCell(value) {
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function downloadCsv(filename, columns, rows) {
  const lines = [
    columns.map(([, label]) => csvCell(label)).join(','),
    ...rows.map((row) => columns.map(([key]) => csvCell(row[key])).join(',')),
  ]
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function ReportsExport() {
  return (
    <AnalysisScreen title="Reports / Export" description="Download the product and bundle rows from the currently published analysis for account planning and follow-up.">
      {(payload) => {
        const products = Array.isArray(payload.exports?.products) ? payload.exports.products : (Array.isArray(payload.products) ? payload.products : [])
        const bundles = Array.isArray(payload.exports?.bundles) ? payload.exports.bundles : (Array.isArray(payload.bundles?.rules) ? payload.bundles.rules : [])
        const productColumns = [
          ['productId', 'Product ID'], ['productName', 'Product'], ['department', 'Department'],
          ['orders', 'Orders'], ['units', 'Units'], ['reorderRate', 'Reorder rate'], ['averageCartPosition', 'Average cart position'],
        ]
        const bundleColumns = [
          ['antecedentProductName', 'Product'], ['consequentProductName', 'With'],
          ['orders', 'Orders'], ['support', 'Support'], ['confidence', 'Confidence'], ['lift', 'Lift'],
        ]
        const params = payload.parameters || {}

        return <>
          <div className="analysis-grid">
            <MetricCard label="Products available to export" value={products.length.toLocaleString()} />
            <MetricCard label="Bundle rows available to export" value={bundles.length.toLocaleString()} />
            <MetricCard label="Payload generated" value={payload.generatedAt ? new Date(payload.generatedAt).toLocaleString() : '—'} />
          </div>
          <AnalysisPanel title="Export context" description="Downloads use only rows and metadata present in this analysis payload.">
            <dl className="analysis-definition-list">
              <div><dt>Source</dt><dd>{payload.source ?? payload.dataQuality?.source ?? 'Not provided'}</dd></div>
              <div><dt>Basket definition</dt><dd>{params.basketDefinition ?? 'Not provided'}</dd></div>
              <div><dt>Minimum support</dt><dd>{params.minSupport == null ? 'Not provided' : `${(Number(params.minSupport) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`}</dd></div>
              <div><dt>Minimum confidence</dt><dd>{params.minConfidence == null ? 'Not provided' : `${(Number(params.minConfidence) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`}</dd></div>
              <div><dt>Maximum itemset length</dt><dd>{params.maxItemsetLength ?? 'Not provided'}</dd></div>
            </dl>
          </AnalysisPanel>
          <AnalysisPanel title="Product export">
            <div className="analysis-export-actions">
              <p>{products.length.toLocaleString()} product rows in the current export.</p>
              <button type="button" className="analysis-export-button" disabled={!products.length} onClick={() => downloadCsv('cartsense-products.csv', productColumns, products)}>Download product CSV</button>
            </div>
            {products.length
              ? <DataTable searchLabel="Search export products" columns={productColumns} rows={products} />
              : <EmptyState>No product rows are available to export.</EmptyState>}
          </AnalysisPanel>
          <AnalysisPanel title="Bundle export">
            <div className="analysis-export-actions">
              <p>{bundles.length.toLocaleString()} bundle rows in the current export.</p>
              <button type="button" className="analysis-export-button" disabled={!bundles.length} onClick={() => downloadCsv('cartsense-bundles.csv', bundleColumns, bundles)}>Download bundle CSV</button>
            </div>
            {bundles.length
              ? <DataTable searchLabel="Search export bundles" columns={bundleColumns} rows={bundles} />
              : <EmptyState>No bundle rows are available to export.</EmptyState>}
          </AnalysisPanel>
        </>
      }}
    </AnalysisScreen>
  )
}
