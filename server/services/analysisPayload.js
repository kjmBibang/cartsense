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
    importId: payload.importId ?? null,
    dataQuality: payload.dataQuality || null,
    parameters: payload.parameters || null,
    reliability: payload.reliability || null,
    sections: REQUIRED_SECTIONS,
  }
}

export async function saveAnalysisPayload(payload) {
  const completePayload = validateAnalysisPayload(payload)
  const destination = payloadPath()
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`
  await mkdir(path.dirname(destination), { recursive: true })
  try {
    await writeFile(temporary, `${JSON.stringify(completePayload, null, 2)}\n`, 'utf8')
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
  return receipt(completePayload, new Date().toISOString())
}

export async function readAnalysisPayload() {
  try {
    let payload
    try {
      payload = JSON.parse(await readFile(payloadPath(), 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') throw error
      const invalid = new Error(`The saved analysis payload is malformed and cannot be served: ${error.message}`)
      invalid.statusCode = 503
      throw invalid
    }
    try {
      return validateAnalysisPayload(payload)
    } catch (error) {
      error.statusCode = 503
      error.message = `The saved analysis payload is incomplete or invalid: ${error.message}`
      throw error
    }
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
