import { useRef, useState } from 'react'
import { uploadOrders } from '../api.js'
import ScreenShell from '../ScreenShell.jsx'
import '../style/upload-data-check.css'

export default function UploadDataCheck() {
  const inputRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  async function handleUpload() {
    if (!selectedFile) return
    setError('')
    setResult(null)
    setIsUploading(true)
    try {
      const uploadResult = await uploadOrders(selectedFile)
      localStorage.setItem('cartsense.importId', String(uploadResult.importId))
      window.dispatchEvent(new CustomEvent('cartsense:payload-updated'))
      setResult(uploadResult)
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <section className="upload-screen" aria-labelledby="upload-title">
      <ScreenShell number="01" title="Upload & Data Check" description="Upload a grocery order CSV to validate and import it into CartSense." />
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
          {isUploading ? 'Importing...' : 'Validate and import'}
        </button>
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
