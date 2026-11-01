export async function uploadOrders(file) {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch('/api/uploads/orders', { method: 'POST', body: formData })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'Upload failed.')
  return payload
}

export async function getAnalysisSummary(importId) {
  const response = await fetch(`/api/analysis/summary?importId=${encodeURIComponent(importId)}`)
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'Could not load analysis summary.')
  return payload
}
