import AnalysisScreen, { MetricCard } from '../AnalysisScreen.jsx'
import '../style/analysis-settings.css'

export default function AnalysisSettings() {
  return (
    <AnalysisScreen title="Analysis Settings" description="Sensitivity presets, advanced support and confidence fields, and run history.">
      {(payload) => <div className="analysis-grid">
        <MetricCard label="Minimum support" value={payload.parameters.minSupport} />
        <MetricCard label="Minimum confidence" value={payload.parameters.minConfidence} />
        <MetricCard label="Basket definition" value={payload.parameters.basketDefinition} />
        <MetricCard label="Generated" value={new Date(payload.generatedAt).toLocaleString()} />
      </div>}
    </AnalysisScreen>
  )
}
