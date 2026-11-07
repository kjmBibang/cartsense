import { Router } from 'express'
import multer from 'multer'
import { importOrders } from '../services/importOrders.js'
import { publishAnalysisForUpload } from '../services/analysisPipeline.js'
import { checkDatabase } from '../config/database.js'

const router = Router()
const jobs = new Map()
const maxUploadSizeMb = Number(process.env.MAX_UPLOAD_SIZE_MB || 100)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadSizeMb * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
      return callback(null, true)
    }
    return callback(new Error('Only CSV files are supported.'))
  },
})

function updateJob(jobId, update) {
  jobs.set(jobId, { ...jobs.get(jobId), ...update, updatedAt: new Date().toISOString() })
}

function failJob(jobId, error) {
  updateJob(jobId, {
    status: 'failed',
    progress: 100,
    stage: error.stage || 'database_import',
    message: error.message || 'Upload processing failed.',
  })
}

async function processUpload(jobId, file) {
  try {
    updateJob(jobId, { status: 'importing', progress: 10, message: 'Initializing database' })
    try {
      await checkDatabase()
    } catch (cause) {
      const error = new Error(cause.code === 'ER_BAD_DB_ERROR'
        ? 'CartSense database is not initialized. Run server/sql/schema.sql in MySQL or phpMyAdmin, then restart the API.'
        : `Database initialization failed: ${cause.message}`)
      error.statusCode = 503
      error.stage = 'database_initialization'
      throw error
    }

    updateJob(jobId, { progress: 20, message: 'Importing CSV rows' })
    const importResult = await importOrders(file)
    updateJob(jobId, { status: 'analyzing', progress: 60, message: 'Running basket analysis' })
    const analysis = await publishAnalysisForUpload(file, (status) => updateJob(jobId, status))
    updateJob(jobId, {
      status: 'completed', progress: 100, stage: null, message: 'Upload processing completed',
      result: { ...importResult, analysis },
    })
  } catch (error) {
    failJob(jobId, error)
  }
}

router.post('/orders', upload.single('file'), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: 'A CSV file is required in the file field.' })
  const jobId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  jobs.set(jobId, {
    jobId, status: 'queued', progress: 0, message: 'Upload queued', stage: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  })
  void processUpload(jobId, request.file)
  return response.status(202).json({ jobId, status: 'queued', progress: 0, message: 'Upload queued' })
})

router.get('/orders/:jobId', (request, response) => {
  const job = jobs.get(request.params.jobId)
  if (!job) return response.status(404).json({ error: 'Upload job was not found.' })
  const { result, ...status } = job
  return response.json(result ? { ...status, result } : status)
})

export default router
