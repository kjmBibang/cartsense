import AnalysisScreen, { AnalysisPanel, DataTable, EmptyState, HorizontalBarChart, MetricCard } from '../AnalysisScreen.jsx'
import '../style/reliability-report.css'

function missingValueCount(values) {
  if (!values || typeof values !== 'object') return null
  return Object.values(values).reduce((total, count) => total + (Number(count) || 0), 0)
}

export default function ReliabilityReport() {
  return (
    <AnalysisScreen title="Reliability Report" description="Review data completeness, rule coverage, and the limits of the current analysis before sharing conclusions.">
      {(payload) => {
        const reliability = payload.reliability || {}
        const quality = payload.dataQuality || {}
        const validationErrors = Array.isArray(quality.validationErrors) ? quality.validationErrors : []
        const missingCount = missingValueCount(quality.missingValues)
        const validRows = quality.validRows
        const skippedRows = quality.invalidRows ?? quality.skippedRows
        const qualityRows = [
          validRows == null ? null : { label: 'Valid rows', count: Number(validRows) || 0 },
          skippedRows == null ? null : { label: 'Skipped rows', count: Number(skippedRows) || 0 },
        ].filter(Boolean)
        const missingEntries = Object.entries(quality.missingValues || {})
          .filter(([, count]) => Number(count) > 0)
          .map(([field, count]) => ({ field, count }))
        const holdoutScore = reliability.model?.hitRateAtK
        const baselineScore = reliability.baseline?.hitRateAtK
        const hasWarnings = (Number(skippedRows) || 0) > 0 || (missingCount || 0) > 0 || validationErrors.length > 0

        return <>
          <div className="analysis-grid">
            <MetricCard label="Data status" value={reliability.status ?? '—'} />
            <MetricCard label="Valid source rows" value={validRows?.toLocaleString() ?? '—'} />
            <MetricCard label="Skipped rows" value={skippedRows?.toLocaleString() ?? '—'} />
            <MetricCard label="Missing-value count" value={missingCount?.toLocaleString() ?? '—'} />
            <MetricCard label="Rules generated" value={reliability.ruleCount?.toLocaleString() ?? payload.patterns?.rules?.length?.toLocaleString() ?? '—'} />
          </div>
          {hasWarnings && <div className="analysis-warning" role="status">
            <strong>Use caution when interpreting results.</strong>
            <span>{Number(skippedRows) > 0 ? `${Number(skippedRows).toLocaleString()} source rows were skipped. ` : ''}{(missingCount || 0) > 0 ? `${missingCount.toLocaleString()} missing values were reported across fields.` : ''}</span>
          </div>}
          <div className="analysis-chart-grid">
            <AnalysisPanel title="Source-row validation" description="Valid and skipped row counts reported by the payload.">
              <HorizontalBarChart rows={qualityRows} labelKey="label" valueKey="count" label="Valid and skipped source rows" valueFormat={(value) => `${value.toLocaleString()} rows`} />
            </AnalysisPanel>
            <AnalysisPanel title="Evaluation readiness" description="Null values mean that the corresponding score was not calculated.">
              <dl className="analysis-definition-list">
                <div><dt>Evaluation method</dt><dd>{reliability.method ?? 'Not provided'}</dd></div>
                <div><dt>Training users</dt><dd>{reliability.trainUsers?.toLocaleString() ?? '—'}</dd></div>
                <div><dt>Test users</dt><dd>{reliability.testUsers?.toLocaleString() ?? '—'}</dd></div>
                <div><dt>Association-rule hit rate</dt><dd>{holdoutScore == null ? 'Not calculated' : `${(Number(holdoutScore) * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`}</dd></div>
                <div><dt>Popularity baseline hit rate</dt><dd>{baselineScore == null ? 'Not calculated' : `${(Number(baselineScore) * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`}</dd></div>
              </dl>
            </AnalysisPanel>
          </div>
          <AnalysisPanel title="Missing values by field">
            {missingEntries.length
              ? <DataTable searchable={false} columns={ [['field', 'Field'], ['count', 'Missing values']] } rows={missingEntries} />
              : <EmptyState>{quality.missingValues ? 'No missing values were reported.' : 'Missing-value details are not included in this payload.'}</EmptyState>}
          </AnalysisPanel>
          <AnalysisPanel title="Validation issues">
            {validationErrors.length
              ? <DataTable searchLabel="Search validation issues" columns={ [['row', 'Source row'], ['column', 'Column'], ['message', 'Issue']] } rows={validationErrors} />
              : <EmptyState>{quality.validationErrors ? 'No row-level validation issues were reported.' : 'Row-level validation details are not included in this payload.'}</EmptyState>}
          </AnalysisPanel>
          <AnalysisPanel title="Analysis parameters">
            <dl className="analysis-definition-list">
              {Object.entries(reliability.parameters || payload.parameters || {}).map(([key, value]) => (
                <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>
              ))}
            </dl>
            {Object.keys(reliability.parameters || payload.parameters || {}).length === 0 && <EmptyState>No analysis parameters were included.</EmptyState>}
          </AnalysisPanel>
          {reliability.note && <p className="analysis-footnote">{reliability.note}</p>}
        </>
      }}
    </AnalysisScreen>
  )
}
