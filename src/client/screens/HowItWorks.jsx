import AnalysisScreen, { DataTable, MetricCard } from '../AnalysisScreen.jsx'
import '../style/how-it-works.css'

export default function HowItWorks() {
  return (
    <AnalysisScreen title="How It Works" description="Step-through of Apriori passes: frequent items, candidate pairs, and pruning.">
      {(payload) => <>
        <div className="analysis-grid"><MetricCard label="Algorithm" value={payload.howItWorks?.algorithm} /><MetricCard label="Itemsets" value={payload.howItWorks?.trace?.itemsetCount} /><MetricCard label="Max itemset length" value={payload.parameters.maxItemsetLength} /></div>
        <DataTable columns={[['length', 'Pass'], ['itemsets', 'Frequent itemsets']]} rows={payload.howItWorks?.passes || []} />
      </>}
    </AnalysisScreen>
  )
}
