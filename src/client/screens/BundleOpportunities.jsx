import AnalysisScreen, { AnalysisPanel, DataTable, EmptyState, HorizontalBarChart, MetricCard } from '../AnalysisScreen.jsx'

function ruleName(rule) {
  return `${rule.antecedentProductName ?? '—'} + ${rule.consequentProductName ?? '—'}`
}

export default function BundleOpportunities() {
  return (
    <AnalysisScreen title="Bundle Opportunities" description="Prioritize product pairings for cross-sell placement, promotions, and in-store follow-up.">
      {(payload) => {
        const rules = Array.isArray(payload.bundles?.rules) ? payload.bundles.rules : []
        const rankedRules = [...rules].sort((a, b) => (Number(b.lift) || 0) - (Number(a.lift) || 0)
          || (Number(b.support) || 0) - (Number(a.support) || 0))
        const strongest = rankedRules[0]
        const highLiftCount = rules.filter((rule) => Number(rule.lift) > 1).length
        const chartRows = rankedRules.slice(0, 8).map((rule, index) => ({
          ...rule,
          id: `${rule.antecedentProductId}-${rule.consequentProductId}-${index}`,
          pairing: ruleName(rule),
        }))
        const tableRows = rankedRules.map((rule, index) => ({
          ...rule,
          rank: index + 1,
          pairing: ruleName(rule),
        }))

        return <>
          <div className="analysis-grid">
            <MetricCard label="Pairing opportunities" value={rules.length.toLocaleString()} />
            <MetricCard label="Pairings with lift above 1" value={highLiftCount.toLocaleString()} />
            <MetricCard label="Strongest observed lift" value={strongest ? `${Number(strongest.lift).toLocaleString(undefined, { maximumFractionDigits: 2 })}×` : '—'} />
            <MetricCard label="Minimum support used" value={payload.parameters?.minSupport == null ? '—' : `${(Number(payload.parameters.minSupport) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`} />
          </div>
          <AnalysisPanel title="Highest-lift pairings" description="Ranked by lift, with support shown to keep small-sample pairings in context.">
            <HorizontalBarChart
              rows={chartRows}
              labelKey="pairing"
              valueKey="lift"
              label="Top product pairings by lift"
              valueFormat={(value) => `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}× lift`}
            />
          </AnalysisPanel>
          <AnalysisPanel title="What to act on">
            {strongest
              ? <ul className="analysis-insight-list">
                <li><strong>Strongest relative association:</strong> {ruleName(strongest)} has lift {Number.isFinite(Number(strongest.lift)) ? `${Number(strongest.lift).toLocaleString(undefined, { maximumFractionDigits: 2 })}×` : 'not reported'} with {strongest.support == null ? 'support not reported' : `${(Number(strongest.support) * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}% support`}.</li>
                <li><strong>Promotion candidates:</strong> Compare lift with support and confidence in the ranked table. Favor pairings that are both more likely together and observed in enough baskets for the intended campaign.</li>
                <li><strong>Interpretation:</strong> Lift above 1 indicates a pairing observed more often than independence would suggest; high lift alone does not establish broad demand.</li>
              </ul>
              : <EmptyState>No bundle rules were produced for this analysis.</EmptyState>}
          </AnalysisPanel>
          <AnalysisPanel title="Ranked opportunity table" description="Higher lift ranks first; support and confidence provide reach and reliability context.">
            <DataTable
              searchLabel="Search bundle opportunities"
              columns={ [['rank', 'Rank'], ['pairing', 'Product pairing'], ['orders', 'Orders'], ['support', 'Support'], ['confidence', 'Confidence'], ['lift', 'Lift']] }
              rows={tableRows}
            />
          </AnalysisPanel>
        </>
      }}
    </AnalysisScreen>
  )
}
