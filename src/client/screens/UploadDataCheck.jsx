import { useEffect, useRef, useState } from 'react'
import { uploadOrders } from '../api.js'
import ScreenShell from '../ScreenShell.jsx'
import '../style/upload-data-check.css'

export default function UploadDataCheck() {
  const inputRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStartedAt, setUploadStartedAt] = useState(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

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
      <ScreenShell title="Upload & Data Check" description="Upload a grocery order CSV up to 100 MB to validate and import it into CartSense." />
      <div className="upload-panel">
        <button className="upload-dropzone" type="button" onClick={() => inputRef.current?.click()}>
          <strong>{selectedFile ? selectedFile.name : 'Choose a CSV file'}</strong>
          <span>{selectedFile ? `${Math.ceil(selectedFile.size / 1024)} KB selected` : 'Required columns will be checked automatically'}</span>
        </button>
        <input
          ref={inputRef}
          className="upload-input"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
        />
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
        {error && <p className="upload-error" role="alert">{error}</p>}
        {result && (
          <div className="upload-result" role="status">
            <div className="upload-stats">
              <span><strong>{result.importedRows}</strong> imported</span>
              <span><strong>{result.skippedRows}</strong> skipped</span>
              <span><strong>{result.importId}</strong> import ID</span>
            </div>
            {result.validationErrors.length > 0 && (
              <p className="upload-warning">Rows skipped: {result.validationErrors.map((item) => item.row).join(', ')}. Check the source CSV before importing again.</p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
