import AnalysisScreen, { DataTable, MetricCard } from '../AnalysisScreen.jsx'
import '../style/association-network.css'

export default function AssociationNetwork() {
  return (
    <AnalysisScreen title="Association Network" description="Network view of products connected by strong pairings.">
      {(payload) => <>
        <div className="analysis-grid"><MetricCard label="Products in network" value={payload.network?.nodes?.length} /><MetricCard label="Connections" value={payload.network?.edges?.length} /></div>
        <DataTable columns={[['source', 'Product ID'], ['target', 'Connected product'], ['support', 'Support'], ['confidence', 'Confidence'], ['lift', 'Lift']]} rows={payload.network?.edges || []} />
      </>}
    </AnalysisScreen>
  )
}
