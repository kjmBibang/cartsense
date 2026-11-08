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

export async function clearAnalysisPayload() {
  const response = await fetch('/api/analysis/payload', { method: 'DELETE' })
  if (!response.ok) {
    const payload = await response.json()
    throw new Error(payload.error || 'Could not clear the analysis payload.')
  }
}

export async function getImportHistory() {
  const response = await fetch('/api/analysis/imports')
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'Could not load upload history.')
  return payload
}

export async function deleteImport(importId) {
  const response = await fetch(`/api/analysis/imports/${encodeURIComponent(importId)}`, { method: 'DELETE' })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error || 'Could not delete the import.')
  }
  const startedAt = Date.now()
  while (Date.now() - startedAt < 15 * 60 * 1000) {
    await new Promise((resolve) => window.setTimeout(resolve, 750))
    const statusResponse = await fetch(`/api/analysis/imports/${encodeURIComponent(importId)}/delete/${encodeURIComponent(payload.jobId)}`)
    const statusPayload = await statusResponse.json()
    if (!statusResponse.ok) throw new Error(statusPayload.error || 'Could not load import deletion status.')
    if (statusPayload.status === 'failed') throw new Error(statusPayload.message || 'Import deletion failed.')
    if (statusPayload.status === 'completed') return
  }
  throw new Error('Import deletion timed out. Check the API logs before retrying.')
}

export async function getDataCheck(filters) {
  const params = new URLSearchParams()
  if (filters.importIds?.length) params.set('importIds', filters.importIds.join(','))
  if (filters.orderDow !== '') params.set('orderDow', filters.orderDow)
  if (filters.orderHour !== '') params.set('orderHour', filters.orderHour)
  if (filters.department.trim()) params.set('department', filters.department.trim())
  if (filters.search.trim()) params.set('search', filters.search.trim())
  params.set('limit', '500')
  const response = await fetch(`/api/analysis/data-check?${params}`)
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'Could not load database data.')
  return payload
}

export async function publishSelectedAnalysis(importIds) {
  const response = await fetch('/api/analysis/scope-analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ importIds }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'Could not start selected analysis.')
  const startedAt = Date.now()
  while (Date.now() - startedAt < 15 * 60 * 1000) {
    await new Promise((resolve) => window.setTimeout(resolve, 1000))
    const statusResponse = await fetch(`/api/analysis/scope-analysis/${encodeURIComponent(payload.jobId)}`)
    const statusPayload = await statusResponse.json()
    if (!statusResponse.ok) throw new Error(statusPayload.error || 'Could not load selected analysis status.')
    if (statusPayload.status === 'failed') throw new Error(statusPayload.message || 'Selected analysis failed.')
    if (statusPayload.status === 'cancelled') throw new Error('Selected analysis was replaced by a newer import selection.')
    if (statusPayload.status === 'completed') return statusPayload.receipt
  }
  throw new Error('Selected analysis timed out. Check the API logs before retrying.')
}
