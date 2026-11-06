import AnalysisScreen, { DataTable } from '../AnalysisScreen.jsx'
import '../style/department-insights.css'

export default function DepartmentInsights() {
  return (
    <AnalysisScreen title="Department Insights" description="Department share, co-occurrence heatmap, and reorder rate by department.">
      {(payload) => <DataTable columns={[['department', 'Department'], ['orders', 'Orders'], ['items', 'Items'], ['products', 'Products'], ['reorderRate', 'Reorder %']]} rows={payload.departments?.rows || []} />}
    </AnalysisScreen>
  )
}
