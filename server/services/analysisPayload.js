import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const REQUIRED_SECTIONS = [
  'schemaVersion',
  'generatedAt',
  'parameters',
  'dataQuality',
  'summary',
  'dashboard',
  'products',
  'departments',
  'behavior',
  'patterns',
  'bundles',
  'network',
  'reliability',
  'howItWorks',
  'exports',
]

function payloadPath() {
  return path.resolve(process.env.ANALYSIS_PAYLOAD_PATH || './artifacts/analysis-payload.json')
}

export function validateAnalysisPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Analysis payload must be a JSON object.')
    error.statusCode = 400
    throw error
  }
  if (payload.schemaVersion !== '1.0') {
    const error = new Error('Unsupported analysis payload schemaVersion. Expected 1.0.')
    error.statusCode = 400
    throw error
  }
  const missingSections = REQUIRED_SECTIONS.filter((section) => !(section in payload))
  if (missingSections.length) {
    const error = new Error(`Analysis payload is missing sections: ${missingSections.join(', ')}`)
    error.statusCode = 400
    throw error
  }
  return payload
}

function receipt(payload, savedAt) {
  return {
    schemaVersion: payload.schemaVersion,
    generatedAt: payload.generatedAt,
    savedAt,
    source: payload.source || null,
    summary: payload.summary || null,
    sections: REQUIRED_SECTIONS,
  }
}

export async function saveAnalysisPayload(payload) {
  validateAnalysisPayload(payload)
  const destination = payloadPath()
  const temporary = `${destination}.${process.pid}.tmp`
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  await rename(temporary, destination)
  return receipt(payload, new Date().toISOString())
}

export async function readAnalysisPayload() {
  try {
    const payload = JSON.parse(await readFile(payloadPath(), 'utf8'))
    return validateAnalysisPayload(payload)
  } catch (error) {
    if (error.code === 'ENOENT') {
      const missing = new Error('No analysis payload has been published yet.')
      missing.statusCode = 404
      throw missing
    }
    throw error
  }
}

export async function getAnalysisPayloadStatus() {
  try {
    const payload = await readAnalysisPayload()
    return { ready: true, ...receipt(payload, null), path: payloadPath() }
  } catch (error) {
    if (error.statusCode === 404) {
      return { ready: false, path: payloadPath(), message: error.message }
    }
    throw error
  }
}