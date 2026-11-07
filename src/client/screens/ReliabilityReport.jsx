import AnalysisScreen, { MetricCard } from '../AnalysisScreen.jsx'
import '../style/reliability-report.css'

export default function ReliabilityReport() {
  return (
    <AnalysisScreen title="Reliability Report" description="Hit rate, popular-items baseline, train-versus-test results, and plain-language explanation.">
      {(payload) => <>
        <div className="analysis-grid"><MetricCard label="Status" value={payload.reliability?.status} /><MetricCard label="Training users" value={payload.reliability?.trainUsers} /><MetricCard label="Test users" value={payload.reliability?.testUsers} /><MetricCard label="Rules evaluated" value={payload.reliability?.ruleCount} /></div>
        <div className="analysis-card"><p>{payload.reliability?.method}</p><p>{payload.reliability?.note}</p></div>
      </>}
    </AnalysisScreen>
  )
}
