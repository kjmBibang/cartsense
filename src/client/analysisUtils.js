export function formatAnalysisValue(key, value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value)
  if (['support', 'confidence', 'reorderRate'].includes(key)) {
    const percentage = key === 'reorderRate' && value > 1 ? value : value * 100
    return `${percentage.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}
