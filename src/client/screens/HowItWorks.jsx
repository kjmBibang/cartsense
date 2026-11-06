import AnalysisScreen, { AnalysisPanel, DataTable, EmptyState, HorizontalBarChart, MetricCard } from '../AnalysisScreen.jsx'
import '../style/how-it-works.css'

export default function HowItWorks() {
  return (
    <AnalysisScreen title="How It Works" description="A concise operational trace of the current run: basket definition, analysis thresholds, and frequent-itemset passes.">
      {(payload) => {
        const trace = payload.howItWorks?.trace || {}
        const passes = Array.isArray(payload.howItWorks?.passes) ? [...payload.howItWorks.passes] : []
        const orderedPasses = passes.sort((a, b) => Number(a.length) - Number(b.length))
          .map((pass) => ({ ...pass, label: `Length ${pass.length}` }))
        const parameters = payload.parameters || {}
        const steps = [
          { title: 'Build baskets', detail: trace.basketDefinition ?? parameters.basketDefinition, count: trace.basketCount, unit: 'baskets' },
          { title: 'Find frequent itemsets', detail: payload.howItWorks?.algorithm, count: trace.itemsetCount, unit: 'itemsets' },
          { title: 'Generate relationships', detail: 'Rule counts and metrics are available in Buying Patterns and Bundle Opportunities.', count: payload.patterns?.rules?.length, unit: 'rules' },
        ].filter((step) => step.detail != null || step.count != null)

        return <>
          <div className="analysis-grid">
            <MetricCard label="Algorithm" value={payload.howItWorks?.algorithm ?? '—'} />
            <MetricCard label="Baskets analyzed" value={trace.basketCount?.toLocaleString() ?? '—'} />
            <MetricCard label="Frequent itemsets" value={trace.itemsetCount?.toLocaleString() ?? '—'} />
            <MetricCard label="Maximum itemset length" value={trace.maxItemsetLength ?? parameters.maxItemsetLength ?? '—'} />
          </div>
          <AnalysisPanel title="Processing trace" description="Values are read from this payload; missing stages are not inferred.">
            {steps.length
              ? <ol className="analysis-process">
                {steps.map((step, index) => <li key={step.title}>
                  <span className="analysis-process-number">{index + 1}</span>
                  <div><h3>{step.title}</h3><p>{step.detail}</p></div>
                  {step.count != null && <strong>{Number(step.count).toLocaleString()} {step.unit}</strong>}
                </li>)}
              </ol>
              : <EmptyState>No processing trace is included in this payload.</EmptyState>}
          </AnalysisPanel>
          <div className="analysis-chart-grid">
            <AnalysisPanel title="Frequent itemsets by pass" description="Each pass corresponds to an itemset length recorded by the analyzer.">
              <HorizontalBarChart rows={orderedPasses} labelKey="label" valueKey="itemsets" label="Frequent itemset counts by pass" valueFormat={(value) => `${value.toLocaleString()} itemsets`} />
            </AnalysisPanel>
            <AnalysisPanel title="Active thresholds">
              <dl className="analysis-definition-list">
                <div><dt>Minimum support</dt><dd>{parameters.minSupport == null ? '—' : `${(Number(parameters.minSupport) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`}</dd></div>
                <div><dt>Minimum confidence</dt><dd>{parameters.minConfidence == null ? '—' : `${(Number(parameters.minConfidence) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`}</dd></div>
                <div><dt>Basket definition</dt><dd>{parameters.basketDefinition ?? trace.basketDefinition ?? '—'}</dd></div>
                <div><dt>Maximum itemset length</dt><dd>{parameters.maxItemsetLength ?? trace.maxItemsetLength ?? '—'}</dd></div>
              </dl>
            </AnalysisPanel>
          </div>
          <AnalysisPanel title="Frequent-itemset pass details">
            <DataTable searchable={false} columns={ [['length', 'Itemset length'], ['itemsets', 'Frequent itemsets']] } rows={orderedPasses} />
          </AnalysisPanel>
          <p className="analysis-footnote">These outputs feed product-level follow-up in Product Explorer, department comparisons in Department Insights, and cross-sell decisions in Buying Patterns and Bundle Opportunities.</p>
        </>
      }}
    </AnalysisScreen>
  )
}
