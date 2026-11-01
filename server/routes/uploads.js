import { Router } from 'express'
import multer from 'multer'
import { importOrders } from '../services/importOrders.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_SIZE_MB || 10) * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
      return callback(null, true)
    }
    return callback(new Error('Only CSV files are supported.'))
  },
})

router.post('/orders', upload.single('file'), async (request, response, next) => {
  if (!request.file) return response.status(400).json({ error: 'A CSV file is required in the file field.' })
  try {
    return response.status(201).json(await importOrders(request.file))
  } catch (error) {
    return next(error)
  }
})

export default router
