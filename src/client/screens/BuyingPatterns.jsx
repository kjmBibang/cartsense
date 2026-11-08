import AnalysisScreen, { AnalysisPanel, DataTable, DetailDisclosure, EmptyState, HorizontalBarChart, MetricCard, ScreenLink } from '../AnalysisScreen.jsx'

export default function BuyingPatterns({ onNavigate }) {
  return (
    <AnalysisScreen title="Buying Patterns" description="Separate products that are merely common from products that are meaningfully associated in baskets.">
      {(payload) => {
        const rules = Array.isArray(payload.patterns?.rules) ? payload.patterns.rules : []
        const rankedRules = [...rules].sort((a, b) => (Number(b.lift) || 0) - (Number(a.lift) || 0)
          || (Number(b.support) || 0) - (Number(a.support) || 0))
        const strongest = rankedRules[0]
        const avgConfidence = rules.length
          ? rules.reduce((sum, rule) => sum + (Number(rule.confidence) || 0), 0) / rules.length
          : null
        const avgSupport = rules.length
          ? rules.reduce((sum, rule) => sum + (Number(rule.support) || 0), 0) / rules.length
          : null
        const avgLift = rules.length
          ? rules.reduce((sum, rule) => sum + (Number(rule.lift) || 0), 0) / rules.length
          : null
        const chartRows = rankedRules.slice(0, 8).map((rule, index) => ({
          ...rule,
          id: `${rule.antecedentProductId}-${rule.consequentProductId}-${index}`,
          relationship: `${rule.antecedentProductName ?? '—'} → ${rule.consequentProductName ?? '—'}`,
        }))

        return <>
          <div className="analysis-grid">
            <MetricCard label="Association rules" value={rules.length.toLocaleString()} />
            <MetricCard label="Average rule confidence" value={avgConfidence == null ? '—' : `${(avgConfidence * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`} />
            <MetricCard label="Average rule support" value={avgSupport == null ? '—' : `${(avgSupport * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`} />
            <MetricCard label="Average rule lift" value={avgLift == null ? '—' : `${avgLift.toLocaleString(undefined, { maximumFractionDigits: 2 })}×`} />
            <MetricCard label="Basket definition" value={payload.parameters?.basketDefinition ?? '—'} />
          </div>
          <AnalysisPanel title="Strongest relationships" description="Lift compares observed co-purchases with what would be expected if products were independent.">
            <HorizontalBarChart
              rows={chartRows}
              labelKey="relationship"
              valueKey="lift"
              label="Strongest association rules by lift"
              valueFormat={(value) => `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}× lift`}
            />
            <ScreenLink onNavigate={onNavigate} target="bundles">See bundle opportunities</ScreenLink>
          </AnalysisPanel>
          <AnalysisPanel title="Reading the results">
            {strongest
              ? <ul className="analysis-insight-list">
                <li><strong>Strongest relative relationship:</strong> {strongest.antecedentProductName ?? '—'} is associated with {strongest.consequentProductName ?? '—'} at {Number(strongest.lift).toLocaleString(undefined, { maximumFractionDigits: 2 })}× lift.</li>
                <li><strong>Common is not the same as related:</strong> Support describes how often a rule appears in all baskets. Lift describes how much more often the pair occurs than independence predicts.</li>
                <li><strong>Sales follow-up:</strong> Use confidence for the chance of the consequent given the antecedent, and support to assess how many baskets the rule reaches. Review all three before acting.</li>
              </ul>
              : <EmptyState>No association rules are available. The analysis may not have found a qualifying relationship.</EmptyState>}
            <DetailDisclosure title="Support, confidence, and lift">
              Support is the share of baskets containing the relationship. Confidence is the chance of the consequent given the antecedent. Lift compares the observed relationship with an independence baseline.
            </DetailDisclosure>
          </AnalysisPanel>
          <AnalysisPanel title="Association rules" description="Sortable and searchable; percentages reflect the payload's rule values.">
            <DataTable
              searchLabel="Search association rules"
              columns={ [['antecedentProductName', 'When customers buy'], ['consequentProductName', 'They also buy'], ['orders', 'Orders'], ['support', 'Support'], ['confidence', 'Confidence'], ['lift', 'Lift']] }
              rows={rankedRules}
            />
          </AnalysisPanel>
        </>
      }}
    </AnalysisScreen>
  )
}
