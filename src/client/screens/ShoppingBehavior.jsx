import AnalysisScreen, { DataTable } from '../AnalysisScreen.jsx'
import '../style/shopping-behavior.css'

export default function ShoppingBehavior() {
  return (
    <AnalysisScreen title="Shopping Behavior" description="Heatmaps and distributions for timing, basket size, customers, and reorders.">
      {(payload) => <div className="analysis-grid">
        <DataTable columns={[['day', 'Day'], ['hour', 'Hour'], ['orders', 'Orders']]} rows={payload.behavior?.heatmap || []} />
        <DataTable columns={[['reordered', 'Reordered'], ['items', 'Items']]} rows={payload.behavior?.reorders || []} />
      </div>}
    </AnalysisScreen>
  )
}
