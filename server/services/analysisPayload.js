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

const OBJECT_SECTIONS = [
  'parameters',
  'dataQuality',
  'summary',
  'dashboard',
  'departments',
  'behavior',
  'patterns',
  'bundles',
  'network',
  'reliability',
  'howItWorks',
  'exports',
]

function invalidPayload(message) {
  const error = new Error(message)
  error.statusCode = 400
  return error
}

function payloadPath() {
  return path.resolve(process.env.ANALYSIS_PAYLOAD_PATH || './artifacts/analysis-payload.json')
}

export function validateAnalysisPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw invalidPayload('Analysis payload must be a JSON object.')
  }
  if (payload.schemaVersion !== '1.0') {
    throw invalidPayload('Unsupported analysis payload schemaVersion. Expected 1.0.')
  }
  const missingSections = REQUIRED_SECTIONS.filter((section) => !Object.hasOwn(payload, section))
  if (missingSections.length) {
    throw invalidPayload(`Analysis payload is missing sections: ${missingSections.join(', ')}`)
  }
  if (typeof payload.generatedAt !== 'string' || !payload.generatedAt.trim() || Number.isNaN(Date.parse(payload.generatedAt))) {
    throw invalidPayload('Analysis payload generatedAt must be a valid date string.')
  }
  if (!Array.isArray(payload.products)) {
    throw invalidPayload('Analysis payload section "products" must be an array.')
  }
  for (const section of OBJECT_SECTIONS) {
    const value = payload[section]
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw invalidPayload(`Analysis payload section "${section}" must be an object.`)
    }
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
    return { ready: true, ...receipt(payload, null) }
  } catch (error) {
    if (error.statusCode === 404) {
      return { ready: false, message: error.message }
    }
    throw error
  }
}
