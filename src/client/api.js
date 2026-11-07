export async function uploadOrders(file) {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch('/api/uploads/orders', { method: 'POST', body: formData })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'Upload failed.')
  if (!payload.jobId) throw new Error('Upload did not return a processing job.')

  const startedAt = Date.now()
  while (Date.now() - startedAt < 15 * 60 * 1000) {
    await new Promise((resolve) => window.setTimeout(resolve, 1000))
    const statusResponse = await fetch(`/api/uploads/orders/${encodeURIComponent(payload.jobId)}`)
    const statusPayload = await statusResponse.json()
    if (!statusResponse.ok) throw new Error(statusPayload.error || 'Could not load upload status.')
    if (statusPayload.status === 'failed') {
      throw new Error(statusPayload.message || 'Upload processing failed.')
    }
    if (statusPayload.status === 'completed') {
      return statusPayload.result
    }
  }

  throw new Error('Upload processing timed out. Check the API logs before retrying.')
}

export async function getAnalysisSummary(importId) {
  const response = await fetch(`/api/analysis/summary?importId=${encodeURIComponent(importId)}`)
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'Could not load analysis summary.')
  return payload
}

export async function getAnalysisPayload() {
  const response = await fetch('/api/analysis/payload')
  const payload = await response.json()
  if (response.status === 404) return null
  if (!response.ok) throw new Error(payload.error || 'Could not load the analysis payload.')
  return payload
}

export async function getAnalysisPayloadStatus() {
  const response = await fetch('/api/analysis/payload/status')
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'Could not load payload status.')
  return payload
}
