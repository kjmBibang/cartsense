import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import { checkDatabase } from './config/database.js'
import uploadRoutes from './routes/uploads.js'
import analysisRoutes from './routes/analysis.js'

const app = express()
const port = Number(process.env.PORT || 3001)

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }))
app.use(express.json())

app.get('/api/health', async (_request, response) => {
  try {
    await checkDatabase()
    response.json({ status: 'ok', database: 'connected' })
  } catch (error) {
    response.status(503).json({ status: 'error', database: 'unavailable', message: error.message })
  }
})

app.use('/api/uploads', uploadRoutes)
app.use('/api/analysis', analysisRoutes)

app.use((error, _request, response, next) => {
  void next
  if (error.statusCode) {
    return response.status(error.statusCode).json({ error: error.message })
  }
  if (error.code === 'LIMIT_FILE_SIZE') {
    return response.status(413).json({ error: 'The uploaded file is too large.' })
  }
  if (error.message === 'Only CSV files are supported.') {
    return response.status(415).json({ error: error.message })
  }
  console.error(error)
  return response.status(500).json({ error: 'An unexpected server error occurred.' })
})

app.listen(port, () => {
  console.log(`CartSense API listening on http://localhost:${port}`)
})
