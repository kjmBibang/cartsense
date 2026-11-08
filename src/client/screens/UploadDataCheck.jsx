import { useCallback, useEffect, useMemo, useState } from 'react'
import { clearAnalysisPayload, getAnalysisPayload, getDataCheck, getImportHistory, publishSelectedAnalysis, uploadOrders } from '../api.js'
import { InfoTip, ScreenLink } from '../AnalysisScreen.jsx'
import '../style/upload-data-check.css'

function readStoredImportSelection() {
  try {
    const stored = localStorage.getItem('cartsense.selectedImportIds')
    if (stored === null) return null
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed.filter((id) => Number.isSafeInteger(Number(id)) && Number(id) > 0).map(Number) : []
  } catch {
    return null
  }
}

export default function UploadDataCheck() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStartedAt, setUploadStartedAt] = useState(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [hasPublishedAnalysis, setHasPublishedAnalysis] = useState(false)
  const [payloadStatusError, setPayloadStatusError] = useState('')
  const [imports, setImports] = useState([])
  const [selectedImportIds, setSelectedImportIds] = useState(() => readStoredImportSelection() ?? [])
  const [hasStoredSelection, setHasStoredSelection] = useState(() => readStoredImportSelection() !== null)
  const [filters, setFilters] = useState({ orderDow: '', orderHour: '', department: '', search: '' })
  const [dataCheck, setDataCheck] = useState(null)
  const [historyError, setHistoryError] = useState('')
  const [dataCheckLoading, setDataCheckLoading] = useState(false)
  const [scopeStatus, setScopeStatus] = useState('')
  const [scopeError, setScopeError] = useState('')
  const [importsLoaded, setImportsLoaded] = useState(false)

  const completedImports = useMemo(() => imports.filter((item) => item.status === 'completed'), [imports])

  const refreshImports = useCallback(async (preferredId = null) => {
    try {
      const history = await getImportHistory()
      setImports(history)
      setHistoryError('')
      setSelectedImportIds((current) => {
        if (preferredId && history.some((item) => Number(item.id) === Number(preferredId))) return [Number(preferredId)]
        const valid = current.filter((id) => history.some((item) => Number(item.id) === Number(id)))
        return hasStoredSelection ? valid : history.filter((item) => item.status === 'completed').map((item) => Number(item.id))
      })
      setHasStoredSelection(true)
      setImportsLoaded(true)
    } catch (requestError) {
      setHistoryError(requestError.message || 'Could not load upload history.')
      setImportsLoaded(true)
    }
  }, [hasStoredSelection])

  useEffect(() => {
    let active = true
    const refresh = () => {
      getAnalysisPayload()
        .then((payload) => {
          if (active) {
            setHasPublishedAnalysis(Boolean(payload))
            setPayloadStatusError('')
          }
        })
        .catch((requestError) => {
          if (active) setPayloadStatusError(requestError.message || 'Could not check the current analysis.')
        })
    }

    void Promise.resolve().then(() => {
      refresh()
      refreshImports()
    })
    window.addEventListener('cartsense:payload-updated', refresh)
    return () => {
      active = false
      window.removeEventListener('cartsense:payload-updated', refresh)
    }
  }, [refreshImports])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => { if (active) setDataCheckLoading(true) })
    getDataCheck({ importIds: selectedImportIds, ...filters })
      .then((resultData) => { if (active) setDataCheck(resultData) })
      .catch((requestError) => { if (active) setHistoryError(requestError.message || 'Could not load database data.') })
      .finally(() => { if (active) setDataCheckLoading(false) })
    return () => { active = false }
  }, [selectedImportIds, filters])

  useEffect(() => {
    if (!importsLoaded) return undefined
    localStorage.setItem('cartsense.selectedImportIds', JSON.stringify(selectedImportIds))
    return undefined
  }, [importsLoaded, selectedImportIds])

  useEffect(() => {
    let active = true
    if (!importsLoaded) return () => { active = false }
    if (!selectedImportIds.length) {
      void Promise.resolve().then(async () => {
        if (!active) return
        setScopeStatus('No imports selected. Clearing analysis on the other screens...')
        setScopeError('')
        try {
          await clearAnalysisPayload()
          if (active) {
            setScopeStatus('No imports selected. Other analysis screens are now empty.')
            window.dispatchEvent(new CustomEvent('cartsense:payload-updated'))
          }
        } catch (requestError) {
          if (active) setScopeError(requestError.message || 'Could not clear selected analysis.')
        }
      })
      return () => { active = false }
    }
    void Promise.resolve().then(async () => {
      if (!active) return
      setScopeStatus('Updating analysis for the selected imports...')
      setScopeError('')
      try {
        await publishSelectedAnalysis(selectedImportIds)
        if (active) {
          setScopeStatus('All analysis screens now use the selected imports.')
          window.dispatchEvent(new CustomEvent('cartsense:payload-updated'))
        }
      } catch (requestError) {
        if (active) {
          setScopeError(requestError.message || 'Could not update selected analysis.')
          setScopeStatus('The previous analysis remains active.')
        }
      }
    })
    return () => { active = false }
  }, [importsLoaded, selectedImportIds])

  useEffect(() => {
    if (!isUploading || !uploadStartedAt) return undefined

    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - uploadStartedAt) / 1000))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [isUploading, uploadStartedAt])

  function processingStage() {
    if (elapsedSeconds < 5) return 'Uploading and validating the CSV...'
    if (elapsedSeconds < 60) return 'Importing valid rows into CartSense...'
    return 'Running basket analysis and preparing the dashboard payload...'
  }

  function formatElapsedTime() {
    const minutes = Math.floor(elapsedSeconds / 60)
    const seconds = elapsedSeconds % 60
    return minutes ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`
  }

  async function handleUpload() {
    if (!selectedFile) return
    setError('')
    setResult(null)
    setIsUploading(true)
    setUploadStartedAt(Date.now())
    setElapsedSeconds(0)
    try {
      const uploadResult = await uploadOrders(selectedFile)
      await refreshImports(uploadResult.importId)
      localStorage.setItem('cartsense.importId', String(uploadResult.importId))
      window.dispatchEvent(new CustomEvent('cartsense:payload-updated'))
      setHasPublishedAnalysis(true)
      setResult(uploadResult)
    } catch (uploadError) {
      setError(uploadError.message || 'Could not upload the CSV.')
    } finally {
      setIsUploading(false)
      setUploadStartedAt(null)
    }
  }

  return (
    <section className="upload-screen" aria-labelledby="upload-title">
      <header className="upload-heading">
        <div>
          <h1 id="upload-title">Upload & Data Check</h1>
          <p>Upload a grocery order CSV (up to 100 MB) to validate, import, and analyze it.</p>
        </div>
        <span className={`upload-current-status${hasPublishedAnalysis ? ' is-ready' : ''}`}>
          {hasPublishedAnalysis ? 'Analysis available' : 'No analysis published'}
        </span>
      </header>
      <div className="upload-panel">
        <label className="upload-dropzone" htmlFor="orders-csv">
          <strong>{selectedFile ? selectedFile.name : 'Choose a CSV file'}</strong>
          <span>{selectedFile ? `${Math.ceil(selectedFile.size / 1024)} KB selected` : 'Required columns will be checked automatically'}</span>
          <span className="upload-file-hint">Uploads are retained in MySQL. Identical files are only imported once.</span>
          <input
            id="orders-csv"
            className="upload-input"
            type="file"
            accept=".csv,text/csv"
            aria-label="Choose grocery order CSV file"
            onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
          />
        </label>
        <button className="upload-action" type="button" disabled={!selectedFile || isUploading} onClick={handleUpload}>
          {isUploading ? 'Processing...' : 'Validate and import'}
        </button>
        {isUploading && (
          <div className="upload-progress" role="status" aria-live="polite">
            <strong>{processingStage()}</strong>
            <span>Elapsed time: {formatElapsedTime()}</span>
            <small>Large POS datasets can take several minutes. Please keep this tab and the API terminal open.</small>
          </div>
        )}
        {payloadStatusError && <p className="upload-error" role="alert">Current analysis status could not be checked: {payloadStatusError}</p>}
        {error && <p className="upload-error" role="alert">{error}</p>}
        {result && (
          <div className="upload-result" role="status">
            <h2>Import complete</h2>
            <p className="upload-result-summary">{result.filename ?? selectedFile?.name ?? 'CSV file'} {result.duplicate ? 'was already imported; the existing database import is selected.' : 'has been processed and added to the database.'}</p>
            <div className="upload-stats">
              <span><strong>{Number(result.totalRows ?? 0).toLocaleString()}</strong> source rows</span>
              <span><strong>{Number(result.importedRows ?? 0).toLocaleString()}</strong> imported</span>
              <span><strong>{Number(result.skippedRows ?? 0).toLocaleString()}</strong> skipped</span>
              <span><strong>{result.importId ?? '—'}</strong> import ID</span>
            </div>
            {Array.isArray(result.validationErrors) && result.validationErrors.length > 0 && (
              <>
                <p className="upload-warning">{result.validationErrors.length.toLocaleString()} validation warning(s). Review the source rows before relying on analysis affected by those records.</p>
                <ul className="upload-validation-list">
                  {result.validationErrors.slice(0, 20).map((item, index) => (
                    <li key={`${item.row}-${item.column}-${index}`}>Row {item.row}{item.column ? `, ${item.column}` : ''}: {Array.isArray(item.errors) ? item.errors.join('; ') : item.message}</li>
                  ))}
                </ul>
                {result.validationErrors.length > 20 && <p className="analysis-footnote">Showing the first 20 validation warnings.</p>}
              </>
            )}
          </div>
        )}
      </div>
      <section className="upload-history" aria-labelledby="upload-history-title">
        <div className="upload-section-heading">
          <div>
            <h2 id="upload-history-title">Imported CSV history</h2>
            <p>Select one or more files to see their combined database data.</p>
          </div>
          <span className="upload-history-count">{completedImports.length} completed</span>
        </div>
        {historyError && <p className="upload-error" role="alert">{historyError}</p>}
        {!historyError && !imports.length && <p className="upload-empty">No CSV imports are available yet.</p>}
        {imports.length > 0 && <div className="upload-import-list">
          {imports.map((item) => {
            const selected = selectedImportIds.includes(Number(item.id))
            return <label className={`upload-import-item${selected ? ' is-selected' : ''}`} key={item.id}>
              <input
                type="checkbox"
                checked={selected}
                disabled={item.status !== 'completed'}
                onChange={() => setSelectedImportIds((current) => selected
                  ? current.filter((id) => id !== Number(item.id))
                  : [...current, Number(item.id)])}
              />
              <span className="upload-import-main"><strong>{item.filename}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></span>
              <span className="upload-import-stat">{Number(item.importedRows).toLocaleString()} rows</span>
              <span className={`upload-import-status is-${item.status}`}>{item.status}</span>
            </label>
          })}
        </div>}
      </section>
      <section className="upload-data-check" aria-labelledby="database-data-title">
        <div className="upload-section-heading">
          <div>
            <h2 id="database-data-title">Database data check</h2>
            <p>These totals come from the selected rows stored in MySQL.</p>
          </div>
          {dataCheckLoading && <span className="upload-loading">Refreshing...</span>}
        </div>
        <p className="upload-scope-status" role="status">{scopeStatus}</p>
        {scopeError && <p className="upload-error" role="alert">{scopeError}</p>}
        <div className="upload-filters">
          <label>Day of week<select value={filters.orderDow} onChange={(event) => setFilters({ ...filters, orderDow: event.target.value })}><option value="">All days</option>{Array.from({ length: 7 }, (_value, day) => <option key={day} value={day}>{day}</option>)}</select></label>
          <label>Hour of day<select value={filters.orderHour} onChange={(event) => setFilters({ ...filters, orderHour: event.target.value })}><option value="">All hours</option>{Array.from({ length: 24 }, (_value, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}</select></label>
          <label>Department<input value={filters.department} placeholder="e.g. produce" onChange={(event) => setFilters({ ...filters, department: event.target.value })} /></label>
          <label>Product search<input value={filters.search} placeholder="Name or product ID" onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label>
        </div>
        {dataCheck && <>
          <div className="upload-data-summary">
            {Object.entries(dataCheck.summary).map(([label, value]) => <span key={label}><strong>{Number(value).toLocaleString()}</strong> {label}<InfoTip text={`Filtered ${label} calculated from the selected CSV imports in MySQL.`} /></span>)}
          </div>
          {!selectedImportIds.length && <p className="upload-empty">Select at least one completed CSV to query its rows.</p>}
          {selectedImportIds.length > 0 && !dataCheck.rows.length && <p className="upload-empty">No stored rows match these filters.</p>}
          {dataCheck.rows.length > 0 && <div className="upload-table-wrap"><table className="upload-table"><thead><tr><th>CSV</th><th>Product</th><th>Department</th><th>Day</th><th>Hour</th><th>Orders</th><th>Units</th></tr></thead><tbody>{dataCheck.rows.map((row) => <tr key={`${row.importId}-${row.productId}-${row.orderDow}-${row.orderHour}`}><td>{row.filename}</td><td>{row.productName}</td><td>{row.department}</td><td>{row.orderDow ?? '—'}</td><td>{row.orderHour ?? '—'}</td><td>{row.orders.toLocaleString()}</td><td>{row.units.toLocaleString()}</td></tr>)}</tbody></table></div>}
          <ScreenLink onNavigate={() => window.scrollTo({ top: 0, behavior: 'smooth' })} target="dashboard">See the active analysis dashboard</ScreenLink>
          {dataCheck.rows.length === 500 && <p className="analysis-footnote">Showing the first 500 grouped results.</p>}
        </>}
      </section>
    </section>
  )
}
