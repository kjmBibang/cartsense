import AnalysisScreen, { AnalysisPanel, DataTable, EmptyState } from '../AnalysisScreen.jsx'
import '../style/analysis-settings.css'

const settingLabels = {
  minSupport: 'Minimum support',
  minConfidence: 'Minimum confidence',
  maxItemsetLength: 'Maximum itemset length',
  basketDefinition: 'Basket definition',
}

function settingValue(key, value) {
  if (value == null) return '—'
  if (['minSupport', 'minConfidence'].includes(key) && Number.isFinite(Number(value))) {
    return `${(Number(value) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
  }
  return String(value)
}

export default function AnalysisSettings() {
  return (
    <AnalysisScreen title="Analysis Settings" description="Inspect the exact settings published with this run. These values are read-only and do not change backend analysis.">
      {(payload) => {
        const settings = Object.entries(payload.parameters || {}).map(([key, value]) => ({
          setting: settingLabels[key] ?? key,
          value: settingValue(key, value),
          parameter: key,
        }))

        return <>
          <AnalysisPanel title="Active analysis settings" description="Settings from the current payload; no local controls are connected to the analysis service.">
            {settings.length
              ? <DataTable searchable={false} columns={ [['setting', 'Setting'], ['value', 'Current value'], ['parameter', 'Payload field']] } rows={settings} />
              : <EmptyState>No analysis parameters were included in this payload.</EmptyState>}
          </AnalysisPanel>
          <div className="analysis-info-grid">
            <AnalysisPanel title="Run details">
              <dl className="analysis-definition-list">
                <div><dt>Generated</dt><dd>{payload.generatedAt ? new Date(payload.generatedAt).toLocaleString() : 'Not provided'}</dd></div>
                <div><dt>Source</dt><dd>{payload.source ?? payload.dataQuality?.source ?? 'Not provided'}</dd></div>
                <div><dt>Payload schema</dt><dd>{payload.schemaVersion ?? 'Not provided'}</dd></div>
              </dl>
            </AnalysisPanel>
            <AnalysisPanel title="How settings affect this run">
              <p>Support and confidence thresholds determine which frequent patterns and rules are included. Basket definition and maximum itemset length set the analysis scope. Changing these requires a new backend analysis run; this screen does not submit changes.</p>
            </AnalysisPanel>
          </div>
        </>
      }}
    </AnalysisScreen>
  )
}
