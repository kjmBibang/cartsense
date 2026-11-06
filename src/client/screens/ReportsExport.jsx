import AnalysisScreen, { MetricCard } from '../AnalysisScreen.jsx'
import '../style/reports-export.css'

export default function ReportsExport() {
  return (
    <AnalysisScreen title="Reports / Export" description="One-click PDF or CSV export for the dashboard and top bundles.">
      {(payload) => <>
        <div className="analysis-grid"><MetricCard label="Products ready" value={payload.exports?.products?.length} /><MetricCard label="Bundles ready" value={payload.exports?.bundles?.length} /></div>
        <div className="analysis-card"><p>Export data is available in the published payload. Use the Products and Bundles screens to review the current analysis.</p></div>
      </>}
    </AnalysisScreen>
  )
}
