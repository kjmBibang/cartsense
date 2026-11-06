import AnalysisScreen, { DataTable, MetricCard } from '../AnalysisScreen.jsx'
import '../style/buying-patterns.css'

export default function BuyingPatterns() {
  return (
    <AnalysisScreen title="Buying Patterns" description="Searchable pattern table with an optional technical-metrics view.">
      {(payload) => <>
        <div className="analysis-grid"><MetricCard label="Association rules" value={payload.patterns?.count} /><MetricCard label="Basket definition" value={payload.parameters.basketDefinition} /></div>
        <DataTable columns={[['antecedentProductName', 'When customers buy'], ['consequentProductName', 'They also buy'], ['support', 'Support'], ['confidence', 'Confidence'], ['lift', 'Lift']]} rows={payload.patterns?.rules || []} />
      </>}
    </AnalysisScreen>
  )
}
