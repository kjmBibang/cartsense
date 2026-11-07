import AnalysisScreen, { DataTable, MetricCard } from '../AnalysisScreen.jsx'
import '../style/product-explorer.css'

export default function ProductExplorer() {
  return (
    <AnalysisScreen title="Product Explorer" description="Search products to explore pairings, reorder rate, cart position, and busiest hours.">
      {(payload) => <>
        <div className="analysis-grid"><MetricCard label="Products" value={payload.products.length} /><MetricCard label="Orders" value={payload.summary.orders} /></div>
        <DataTable columns={[['productName', 'Product'], ['department', 'Department'], ['orders', 'Orders'], ['units', 'Units'], ['reorderRate', 'Reorder %'], ['averageCartPosition', 'Avg. cart position']]} rows={payload.products} />
      </>}
    </AnalysisScreen>
  )
}
