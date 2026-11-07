import AnalysisScreen, { DataTable, MetricCard } from '../AnalysisScreen.jsx'
import '../style/bundle-opportunities.css'

export default function BundleOpportunities() {
  return (
    <AnalysisScreen title="Bundle Opportunities" description="Ranked bundles, filters, and a detail panel for each pairing opportunity.">
      {(payload) => {
        const rules = payload.bundles?.rules || []
        return <>
          <div className="analysis-grid"><MetricCard label="Bundle rules" value={rules.length} /><MetricCard label="Minimum support" value={payload.parameters.minSupport} /><MetricCard label="Minimum confidence" value={payload.parameters.minConfidence} /></div>
          <DataTable columns={[['antecedentProductName', 'Product'], ['consequentProductName', 'With'], ['support', 'Support'], ['confidence', 'Confidence'], ['lift', 'Lift']]} rows={rules} />
        </>
      }}
    </AnalysisScreen>
  )
}
