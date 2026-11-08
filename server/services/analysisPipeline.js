import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { saveAnalysisPayload } from './analysisPayload.js'
import pool from '../config/database.js'

const repositoryPythonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../python')

function pipelineError(message, cause, stage = 'python_analysis') {
  const error = new Error(message)
  error.statusCode = 502
  error.stage = stage
  if (cause) error.cause = cause
  return error
}

function runPythonAnalysis(inputPath, outputPath) {
  const executable = process.env.PYTHON_EXECUTABLE || 'python'
  const args = [
    '-m',
    'cartsense_analysis',
    '--input',
    inputPath,
    '--output',
    outputPath,
    '--min-support',
    process.env.ANALYSIS_MIN_SUPPORT || '0.005',
    '--min-confidence',
    process.env.ANALYSIS_MIN_CONFIDENCE || '0.2',
  ]

  return new Promise((resolve, reject) => {
    let stderr = ''
    const pythonPath = [repositoryPythonPath, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)
    const child = spawn(executable, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONPATH: pythonPath },
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => reject(pipelineError('Could not start the Python analysis runtime.', error)))
    child.on('close', (code) => {
      if (code !== 0) {
        const detail = stderr.trim() || `Python analysis exited with code ${code}.`
        reject(pipelineError(`Python analysis failed: ${detail}`))
        return
      }
      resolve()
    })
  })
}

function csvValue(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

async function publishGeneratedAnalysis(inputPath, outputPath, metadata = {}, shouldPublish = () => true) {
  await runPythonAnalysis(inputPath, outputPath)
  let payload
  try {
    payload = JSON.parse(await readFile(outputPath, 'utf8'))
  } catch (error) {
    throw pipelineError(`Python analysis produced an invalid payload: ${error.message}`, error, 'payload_validation')
  }
  if (metadata.importIds) {
    payload.importIds = metadata.importIds
    payload.sources = metadata.sources
    payload.source = metadata.sources.join(', ')
    payload.dataQuality = {
      ...payload.dataQuality,
      source: payload.source,
      importIds: metadata.importIds,
      sources: metadata.sources,
    }
  }
  if (!shouldPublish()) return null
  try {
    return await saveAnalysisPayload(payload)
  } catch (error) {
    if (error.statusCode === 400) error.stage = 'payload_validation'
    throw pipelineError(`The analysis payload could not be published: ${error.message}`, error, 'payload_publication')
  }
}

export async function publishAnalysisForUpload(file, onStatus = () => {}, importResult = null) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cartsense-analysis-'))
  const inputPath = path.join(directory, path.basename(file.originalname || 'orders.csv'))
  const outputPath = path.join(directory, 'analysis-payload.json')

  try {
    await writeFile(inputPath, file.buffer)
    onStatus({ status: 'analyzing', progress: 65, message: 'Running basket analysis' })
    let payload
    await runPythonAnalysis(inputPath, outputPath)
    try { payload = JSON.parse(await readFile(outputPath, 'utf8')) } catch (error) {
      throw pipelineError(`Python analysis produced an invalid payload: ${error.message}`, error, 'payload_validation')
    }
    if (importResult) {
      const pythonQuality = payload.dataQuality || {}
      if (pythonQuality.source !== inputPath) {
        throw pipelineError('Generated analysis does not identify the current upload as its source.', null, 'payload_validation')
      }
      if (pythonQuality.totalRows !== importResult.totalRows || pythonQuality.validRows !== importResult.importedRows) {
        throw pipelineError('Generated analysis row counts do not match the current upload.', null, 'payload_validation')
      }
      const warnings = []
      if (importResult.skippedRows > 0) warnings.push(`${importResult.skippedRows} invalid row(s) were skipped during import.`)
      if (importResult.importedRows < 2) warnings.push('Insufficient imported rows for meaningful association analysis.')
      if (Object.keys(pythonQuality.missingValues || {}).length) warnings.push('The source contains missing optional values; see missingValues for counts.')
      payload.importId = importResult.importId
      payload.source = file.originalname || null
      payload.dataQuality = {
        ...pythonQuality,
        source: file.originalname || null,
        sourceSha256: createHash('sha256').update(file.buffer).digest('hex'),
        totalRows: importResult.totalRows,
        validRows: importResult.importedRows,
        invalidRows: importResult.skippedRows,
        skippedRows: importResult.skippedRows,
        validationErrors: importResult.validationErrors,
        analysisValidationErrors: pythonQuality.validationErrors || [],
        warnings,
        insufficientData: importResult.importedRows < 2,
      }
      payload.reliability = {
        ...payload.reliability,
        warnings,
        insufficientData: importResult.importedRows < 2 || payload.reliability?.status === 'insufficient_rules',
        dataQuality: payload.dataQuality,
      }
    }
    try {
      onStatus({ status: 'publishing', progress: 90, stage: 'payload_publication', message: 'Publishing analysis payload' })
      return await saveAnalysisPayload(payload)
    } catch (error) {
      if (error.statusCode === 400) {
        error.stage = 'payload_validation'
        throw error
      }
      throw pipelineError(`The analysis payload could not be published: ${error.message}`, error, 'payload_publication')
    }
  } catch (error) {
    if (error.stage) throw error
    throw pipelineError('The analysis payload could not be published.', error, 'payload_publication')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function publishAnalysisForImports(importIds, onStatus = () => {}, shouldPublish = () => true) {
  const placeholders = importIds.map(() => '?').join(', ')
  const [rows] = await pool.execute(
    `SELECT ol.import_id AS importId, ol.order_id AS orderId, ol.user_id AS userId,
            ol.order_number AS orderNumber, ol.order_dow AS orderDow,
            ol.order_hour_of_day AS orderHour, ol.days_since_prior_order AS daysSincePriorOrder,
            ol.product_id AS productId, ol.product_name AS productName,
            ol.department, ol.reordered, ol.add_to_cart_order AS addToCartOrder,
            i.original_filename AS filename
     FROM order_lines ol JOIN imports i ON i.id = ol.import_id
     WHERE ol.import_id IN (${placeholders}) AND i.status = 'completed'
     ORDER BY ol.import_id, ol.order_id, ol.add_to_cart_order, ol.id`,
    importIds,
  )
  if (!rows.length) {
    const error = new Error('The selected imports contain no completed rows.')
    error.statusCode = 404
    throw error
  }

  const sources = [...new Set(rows.map((row) => row.filename))]
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cartsense-scope-'))
  const inputPath = path.join(directory, 'selected-orders.csv')
  const outputPath = path.join(directory, 'analysis-payload.json')
  const headers = ['order_id', 'user_id', 'order_number', 'order_dow', 'order_hour_of_day', 'days_since_prior_order', 'product_id', 'add_to_cart_order', 'reordered', 'department', 'product_name']
  const csvRows = rows.map((row) => [
    Number(row.importId) * 10000000000000 + Number(row.orderId),
    Number(row.importId) * 1000000000 + Number(row.userId),
    row.orderNumber, row.orderDow, row.orderHour, row.daysSincePriorOrder,
    row.productId, row.addToCartOrder, row.reordered, row.department, row.productName,
  ].map(csvValue).join(','))

  try {
    await writeFile(inputPath, `${headers.join(',')}\n${csvRows.join('\n')}\n`, 'utf8')
    onStatus({ status: 'analyzing', progress: 50, message: 'Analyzing the selected CSV imports' })
    const receipt = await publishGeneratedAnalysis(inputPath, outputPath, { importIds, sources }, shouldPublish)
    onStatus({ status: 'completed', progress: 100, message: 'Selected import analysis published' })
    return receipt
  } catch (error) {
    if (error.stage) throw error
    throw pipelineError('The selected import analysis could not be published.', error, 'payload_publication')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
