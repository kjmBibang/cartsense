import { useEffect, useState } from 'react'
import { getAnalysisPayload, uploadOrders } from '../api.js'
import '../style/upload-data-check.css'

export default function UploadDataCheck() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStartedAt, setUploadStartedAt] = useState(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [hasPublishedAnalysis, setHasPublishedAnalysis] = useState(false)
  const [payloadStatusError, setPayloadStatusError] = useState('')

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

    refresh()
    window.addEventListener('cartsense:payload-updated', refresh)
    return () => {
      active = false
      window.removeEventListener('cartsense:payload-updated', refresh)
    }
  }, [])

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
          <span className="upload-file-hint">A successful upload replaces the currently published analysis.</span>
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
            <p className="upload-result-summary">{result.filename ?? selectedFile?.name ?? 'CSV file'} has been processed. The new analysis is now active.</p>
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
    </section>
  )
}
