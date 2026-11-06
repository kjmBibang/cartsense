import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

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

const OPTIONAL_ARRAYS = [
  ['dashboard', 'ordersByDay'], ['dashboard', 'ordersByHour'], ['dashboard', 'topProducts'],
  ['departments', 'rows'], ['departments', 'coOccurrence'],
  ['behavior', 'heatmap'], ['behavior', 'reorders'], ['behavior', 'daysSincePriorOrder'], ['behavior', 'basketSizes'],
  ['patterns', 'rules'], ['bundles', 'rules'], ['network', 'nodes'], ['network', 'edges'],
  ['howItWorks', 'passes'], ['exports', 'products'], ['exports', 'bundles'],
]

const OPTIONAL_OBJECTS = [
  ['summary', 'basketSize'], ['howItWorks', 'trace'],
  ['reliability', 'baseline'], ['reliability', 'model'], ['dataQuality', 'missingValues'],
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
  if (payload.products.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw invalidPayload('Analysis payload section "products" must contain JSON objects.')
  }
  for (const section of OBJECT_SECTIONS) {
    const value = payload[section]
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw invalidPayload(`Analysis payload section "${section}" must be an object.`)
    }
  }

  const normalized = structuredClone(payload)
  for (const [section, key] of OPTIONAL_ARRAYS) {
    const value = normalized[section][key]
    if (value === undefined || value === null) normalized[section][key] = []
    else if (!Array.isArray(value)) throw invalidPayload(`Analysis payload section "${section}.${key}" must be an array.`)
    else if (value.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
      throw invalidPayload(`Analysis payload section "${section}.${key}" must contain JSON objects.`)
    }
  }
  for (const [section, key] of OPTIONAL_OBJECTS) {
    const value = normalized[section][key]
    if (value === undefined || value === null) normalized[section][key] = {}
    else if (typeof value !== 'object' || Array.isArray(value)) {
      throw invalidPayload(`Analysis payload section "${section}.${key}" must be an object.`)
    }
  }
  if (normalized.summary.basketSize.distribution === undefined || normalized.summary.basketSize.distribution === null) {
    normalized.summary.basketSize.distribution = []
  } else if (!Array.isArray(normalized.summary.basketSize.distribution)) {
    throw invalidPayload('Analysis payload section "summary.basketSize.distribution" must be an array.')
  } else if (normalized.summary.basketSize.distribution.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw invalidPayload('Analysis payload section "summary.basketSize.distribution" must contain JSON objects.')
  }

  const inspectFiniteNumbers = (value, location = 'payload') => {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw invalidPayload(`Analysis payload contains a non-finite number at "${location}".`)
    }
    if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
      throw invalidPayload(`Analysis payload contains a value that cannot be represented in JSON at "${location}".`)
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => inspectFiniteNumbers(item, `${location}[${index}]`))
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) inspectFiniteNumbers(item, `${location}.${key}`)
    }
  }
  inspectFiniteNumbers(normalized)
  return normalized
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
