import { Router } from 'express'
import pool from '../config/database.js'
import { clearAnalysisPayload, getAnalysisPayloadStatus, readAnalysisPayload, saveAnalysisPayload } from '../services/analysisPayload.js'
import { publishAnalysisForImports } from '../services/analysisPipeline.js'

const router = Router()
const scopeJobs = new Map()
const deleteJobs = new Map()
let latestScopeJobId = null

function updateScopeJob(jobId, update) {
  scopeJobs.set(jobId, { ...scopeJobs.get(jobId), ...update, updatedAt: new Date().toISOString() })
}

router.post('/payload', async (request, response, next) => {
  try {
    return response.status(201).json(await saveAnalysisPayload(request.body))
  } catch (error) {
    return next(error)
  }
})

router.get('/payload', async (_request, response, next) => {
  try {
    return response.json(await readAnalysisPayload())
  } catch (error) {
    return next(error)
  }
})

router.get('/payload/status', async (_request, response, next) => {
  try {
    return response.json(await getAnalysisPayloadStatus())
  } catch (error) {
    return next(error)
  }
})

router.delete('/payload', async (_request, response, next) => {
  try {
    latestScopeJobId = null
    await clearAnalysisPayload()
    return response.status(204).end()
  } catch (error) {
    return next(error)
  }
})

router.post('/scope-analysis', async (request, response, next) => {
  const rawIds = request.body?.importIds
  if (!Array.isArray(rawIds) || !rawIds.length || rawIds.length > 100
      || rawIds.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    return response.status(400).json({ error: 'importIds must be a non-empty array of at most 100 positive integers.' })
  }
  const importIds = [...new Set(rawIds)]
  try {
    const placeholders = importIds.map(() => '?').join(', ')
    const [imports] = await pool.execute(
      `SELECT id FROM imports WHERE id IN (${placeholders}) AND status = 'completed'`,
      importIds,
    )
    if (imports.length !== importIds.length) return response.status(404).json({ error: 'One or more selected imports were not found or are not completed.' })
    const jobId = `scope-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    latestScopeJobId = jobId
    scopeJobs.set(jobId, { jobId, status: 'queued', progress: 0, message: 'Selected analysis queued', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    void publishAnalysisForImports(importIds, (update) => updateScopeJob(jobId, update), () => latestScopeJobId === jobId)
      .then((receipt) => updateScopeJob(jobId, receipt
        ? { status: 'completed', progress: 100, message: 'Selected analysis published', receipt }
        : { status: 'cancelled', progress: 100, message: 'A newer selection replaced this analysis job.' }))
      .catch((error) => updateScopeJob(jobId, { status: 'failed', progress: 100, message: error.message || 'Selected analysis failed.' }))
    return response.status(202).json({ jobId, status: 'queued', progress: 0 })
  } catch (error) {
    return next(error)
  }
})

router.get('/scope-analysis/:jobId', (request, response) => {
  const job = scopeJobs.get(request.params.jobId)
  if (!job) return response.status(404).json({ error: 'Scope analysis job was not found.' })
  return response.json(job)
})

function updateDeleteJob(jobId, update) {
  deleteJobs.set(jobId, { ...deleteJobs.get(jobId), ...update, updatedAt: new Date().toISOString() })
}

async function deleteImportRows(jobId, importId, totalRows) {
  try {
    let deletedRows = 0
    const batchSize = 10000
    updateDeleteJob(jobId, { status: 'deleting', progress: 0, message: 'Deleting stored rows' })
    while (true) {
      const [result] = await pool.execute(`DELETE FROM order_lines WHERE import_id = ? LIMIT ${batchSize}`, [importId])
      deletedRows += result.affectedRows
      if (!result.affectedRows) break
      updateDeleteJob(jobId, {
        status: 'deleting',
        progress: totalRows ? Math.min(99, Math.floor((deletedRows / totalRows) * 100)) : 50,
        message: `Deleted ${deletedRows.toLocaleString()} of ${totalRows.toLocaleString()} stored rows`,
      })
    }
    const [result] = await pool.execute('DELETE FROM imports WHERE id = ?', [importId])
    if (!result.affectedRows) throw new Error(`Import ${importId} was not found.`)
    updateDeleteJob(jobId, { status: 'completed', progress: 100, message: 'Import deleted' })
  } catch (error) {
    updateDeleteJob(jobId, { status: 'failed', progress: 100, message: error.message || 'Import deletion failed.' })
  }
}

router.delete('/imports/:id', async (request, response, next) => {
  const rawId = request.params.id
  const importId = /^\d+$/.test(rawId) ? Number(rawId) : null
  if (!Number.isSafeInteger(importId) || importId <= 0) {
    return response.status(400).json({ error: 'Import ID must be a positive integer.' })
  }

  try {
    const [[existing]] = await pool.execute('SELECT imported_rows AS importedRows FROM imports WHERE id = ?', [importId])
    if (!existing) return response.status(404).json({ error: `Import ${importId} was not found.` })
    const jobId = `delete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    latestScopeJobId = null
    deleteJobs.set(jobId, { jobId, importId, status: 'queued', progress: 0, message: 'Deletion queued', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    void deleteImportRows(jobId, importId, Number(existing.importedRows || 0))
    return response.status(202).json({ jobId, status: 'queued', progress: 0 })
  } catch (error) {
    return next(error)
  }
})

router.get('/imports/:id/delete/:jobId', (request, response) => {
  const job = deleteJobs.get(request.params.jobId)
  if (!job || String(job.importId) !== request.params.id) return response.status(404).json({ error: 'Import deletion job was not found.' })
  return response.json(job)
})

function importId(request) {
  const raw = request.query.importId
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function requireImportId(request, response) {
  const value = importId(request)
  if (!value) {
    response.status(400).json({ error: 'importId query parameter is required.' })
    return null
  }
  return value
}

function queryInteger(value, fallback, minimum, maximum, name, response) {
  if (value === undefined) return fallback
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    response.status(400).json({ error: `${name} must be an integer between ${minimum} and ${maximum}.` })
    return null
  }
  return parsed
}

function queryImportIds(request, response) {
  const raw = request.query.importIds
  if (raw === undefined) return null
  if (typeof raw !== 'string' || !raw.trim()) {
    response.status(400).json({ error: 'importIds must be a comma-separated list of positive integers.' })
    return false
  }
  const values = raw.split(',').map((value) => Number(value))
  if (values.length > 100 || values.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    response.status(400).json({ error: 'importIds must contain at most 100 positive integers.' })
    return false
  }
  return [...new Set(values)]
}

function queryText(value, maximum, name, response) {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > maximum) {
    response.status(400).json({ error: `${name} must be a string of at most ${maximum} characters.` })
    return null
  }
  return value
}

router.get('/imports', async (_request, response, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, original_filename AS filename, status, total_rows AS totalRows,
              imported_rows AS importedRows, skipped_rows AS skippedRows, created_at AS createdAt
       FROM imports ORDER BY created_at DESC, id DESC`,
    )
    return response.json(rows.map((row) => ({
      ...row,
      id: Number(row.id),
      totalRows: Number(row.totalRows || 0),
      importedRows: Number(row.importedRows || 0),
      skippedRows: Number(row.skippedRows || 0),
    })))
  } catch (error) {
    return next(error)
  }
})

router.get('/data-check', async (request, response, next) => {
  const importIds = queryImportIds(request, response)
  if (importIds === false) return
  const orderDow = queryInteger(request.query.orderDow, null, 0, 6, 'orderDow', response)
  if (orderDow === null && request.query.orderDow !== undefined) return
  const orderHour = queryInteger(request.query.orderHour, null, 0, 23, 'orderHour', response)
  if (orderHour === null && request.query.orderHour !== undefined) return
  const department = queryText(request.query.department, 255, 'department', response)
  if (department === null) return
  const search = queryText(request.query.search, 100, 'search', response)
  if (search === null) return
  const limit = queryInteger(request.query.limit, 100, 1, 500, 'limit', response)
  if (limit === null) return

  try {
    const selectedIds = importIds || []
    if (!selectedIds.length) return response.json({ importIds: [], summary: { orders: 0, customers: 0, products: 0, items: 0 }, rows: [] })

    const placeholders = selectedIds.map(() => '?').join(', ')
    const filters = [`ol.import_id IN (${placeholders})`]
    const filterParams = [...selectedIds]
    if (orderDow !== null) {
      filters.push('ol.order_dow = ?')
      filterParams.push(orderDow)
    }
    if (orderHour !== null) {
      filters.push('ol.order_hour_of_day = ?')
      filterParams.push(orderHour)
    }
    if (department !== undefined && department !== '') {
      filters.push('ol.department = ?')
      filterParams.push(department)
    }
    if (search) {
      filters.push('(ol.product_name LIKE ? OR CAST(ol.product_id AS CHAR) LIKE ?)')
      const escapedSearch = search.replace(/[\\%_]/g, '\\$&')
      filterParams.push(`%${escapedSearch}%`, `%${escapedSearch}%`)
    }
    const where = filters.join(' AND ')
    const [[summary]] = await pool.execute(
      `SELECT COUNT(DISTINCT CONCAT(ol.import_id, ':', ol.order_id)) AS orders,
              COUNT(DISTINCT CONCAT(ol.import_id, ':', ol.user_id)) AS customers,
              COUNT(DISTINCT ol.product_id) AS products,
              COUNT(*) AS items
       FROM order_lines ol WHERE ${where}`,
      filterParams,
    )
    const [rows] = await pool.execute(
      `SELECT ol.import_id AS importId, i.original_filename AS filename,
              ol.product_id AS productId, ol.product_name AS productName,
              ol.department, ol.order_dow AS orderDow, ol.order_hour_of_day AS orderHour,
              COUNT(*) AS units,
              COUNT(DISTINCT CONCAT(ol.import_id, ':', ol.order_id)) AS orders,
              AVG(ol.reordered) * 100 AS reorderRate
       FROM order_lines ol
       JOIN imports i ON i.id = ol.import_id
       WHERE ${where}
       GROUP BY ol.import_id, i.original_filename, ol.product_id, ol.product_name,
                ol.department, ol.order_dow, ol.order_hour_of_day
       ORDER BY i.original_filename, units DESC, ol.product_name
       LIMIT ?`,
      [...filterParams, limit],
    )
    const numeric = (value) => Number(value || 0)
    return response.json({
      importIds: selectedIds,
      summary: Object.fromEntries(['orders', 'customers', 'products', 'items'].map((key) => [key, numeric(summary[key])])),
      rows: rows.map((row) => ({
        ...row,
        importId: numeric(row.importId),
        productId: numeric(row.productId),
        orderDow: row.orderDow === null ? null : numeric(row.orderDow),
        orderHour: row.orderHour === null ? null : numeric(row.orderHour),
        units: numeric(row.units),
        orders: numeric(row.orders),
        reorderRate: Number(Number(row.reorderRate || 0).toFixed(1)),
      })),
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/summary', async (request, response, next) => {
  const currentImportId = requireImportId(request, response)
  if (!currentImportId) return
  try {
    const [[metadata]] = await pool.execute(
      `SELECT original_filename AS source, created_at AS generatedAt
       FROM imports WHERE id = ?`,
      [currentImportId],
    )
    if (!metadata) return response.status(404).json({ error: `Import ${currentImportId} was not found.` })

    const [[metrics]] = await pool.execute(
      `SELECT COUNT(DISTINCT order_id) AS orders,
              COUNT(DISTINCT user_id) AS customers,
              COUNT(*) AS items,
              COUNT(DISTINCT product_id) AS products,
              (SELECT AVG(order_size) FROM (
                SELECT order_id, COUNT(*) AS order_size
                FROM order_lines WHERE import_id = ? GROUP BY order_id
              ) baskets) AS averageBasketSize,
              AVG(reordered) * 100 AS reorderRate
       FROM order_lines WHERE import_id = ?`,
      [currentImportId, currentImportId],
    )
    const [byDay] = await pool.execute(
      `SELECT order_dow AS day, COUNT(DISTINCT order_id) AS orders
       FROM order_lines WHERE import_id = ? AND order_dow IS NOT NULL
       GROUP BY order_dow ORDER BY order_dow`,
      [currentImportId],
    )
    const [byHour] = await pool.execute(
      `SELECT order_hour_of_day AS hour, COUNT(DISTINCT order_id) AS orders
       FROM order_lines WHERE import_id = ? AND order_hour_of_day IS NOT NULL
       GROUP BY order_hour_of_day ORDER BY order_hour_of_day`,
      [currentImportId],
    )
    const numeric = (value, digits = null) => {
      const number = Number(value ?? 0)
      if (!Number.isFinite(number)) return 0
      return digits === null ? number : Number(number.toFixed(digits))
    }
    const dayValues = new Map(byDay.map((row) => [Number(row.day), numeric(row.orders)]))
    const hourValues = new Map(byHour.map((row) => [Number(row.hour), numeric(row.orders)]))

    return response.json({
      importId: currentImportId,
      generatedAt: metadata.generatedAt,
      source: metadata.source,
      orders: numeric(metrics.orders),
      customers: numeric(metrics.customers),
      products: numeric(metrics.products),
      items: numeric(metrics.items),
      averageBasketSize: numeric(metrics.averageBasketSize, 2),
      reorderRate: numeric(metrics.reorderRate, 1),
      byDay: Array.from({ length: 7 }, (_value, day) => ({ day, orders: dayValues.get(day) ?? 0 })),
      byHour: Array.from({ length: 24 }, (_value, hour) => ({ hour, orders: hourValues.get(hour) ?? 0 })),
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/products', async (request, response, next) => {
  const currentImportId = requireImportId(request, response)
  if (!currentImportId) return
  const page = queryInteger(request.query.page, 1, 1, 1000000, 'page', response)
  if (page === null) return
  const pageSize = queryInteger(request.query.pageSize, 50, 1, 100, 'pageSize', response)
  if (pageSize === null) return
  const offset = (page - 1) * pageSize
  if (!Number.isSafeInteger(offset) || offset > 1000000) {
    return response.status(400).json({ error: 'Requested page is too large; page offset must not exceed 1000000.' })
  }

  const search = request.query.search
  if (search !== undefined && (typeof search !== 'string' || search.length > 100)) {
    return response.status(400).json({ error: 'search must be a string of at most 100 characters.' })
  }
  const department = request.query.department
  if (department !== undefined && (typeof department !== 'string' || department.length > 255)) {
    return response.status(400).json({ error: 'department must be a string of at most 255 characters.' })
  }
  const sortBy = request.query.sortBy ?? 'orders'
  const sortColumns = { rank: 'rank', orders: 'orders', units: 'units', reorderRate: 'reorderRate', productName: 'productName', productId: 'productId', department: 'department' }
  if (typeof sortBy !== 'string' || !Object.hasOwn(sortColumns, sortBy)) {
    return response.status(400).json({ error: `sortBy must be one of: ${Object.keys(sortColumns).join(', ')}.` })
  }
  const order = request.query.order ?? 'desc'
  if (typeof order !== 'string' || !['asc', 'desc'].includes(order.toLowerCase())) {
    return response.status(400).json({ error: 'order must be "asc" or "desc".' })
  }
  const direction = order.toUpperCase()

  try {
    const [[importRow]] = await pool.execute('SELECT id FROM imports WHERE id = ?', [currentImportId])
    if (!importRow) return response.status(404).json({ error: `Import ${currentImportId} was not found.` })

    const filters = []
    const filterParams = []
    if (search) {
      filters.push('(productName LIKE ? OR CAST(productId AS CHAR) LIKE ?)')
      const escapedSearch = search.replace(/[\\%_]/g, '\\$&')
      filterParams.push(`%${escapedSearch}%`, `%${escapedSearch}%`)
    }
    if (department !== undefined) {
      filters.push('department = ?')
      filterParams.push(department)
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    const base = `SELECT product_id AS productId, product_name AS productName, department,
                         COUNT(DISTINCT order_id) AS orders, COUNT(*) AS units,
                         AVG(reordered) * 100 AS reorderRate
                  FROM order_lines WHERE import_id = ?
                  GROUP BY product_id, product_name, department`
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM (${base}) aggregated ${where}`,
      [currentImportId, ...filterParams],
    )
    const [rows] = await pool.execute(
      `WITH aggregated AS (${base}), ranked AS (
         SELECT productId, productName, department, orders, units, reorderRate,
                ROW_NUMBER() OVER (ORDER BY orders DESC, units DESC, productId ASC) AS rank
         FROM aggregated
       )
       SELECT productId, productName, department, orders, units,
              ROUND(reorderRate, 1) AS reorderRate, rank
       FROM ranked ${where}
       ORDER BY ${sortColumns[sortBy]} ${direction}, productId ASC
       LIMIT ? OFFSET ?`,
      [currentImportId, ...filterParams, pageSize, offset],
    )
    const numeric = (value) => {
      const number = Number(value ?? 0)
      return Number.isFinite(number) ? number : 0
    }
    response.set({
      'X-Total-Count': String(numeric(countRows[0]?.total)),
      'X-Page': String(page),
      'X-Page-Size': String(pageSize),
    })
    return response.json(rows.map((row) => ({
      ...row,
      productId: numeric(row.productId),
      orders: numeric(row.orders),
      units: numeric(row.units),
      reorderRate: numeric(row.reorderRate),
      rank: numeric(row.rank),
    })))
  } catch (error) {
    return next(error)
  }
})

router.get('/departments', async (request, response, next) => {
  const currentImportId = requireImportId(request, response)
  if (!currentImportId) return
  try {
    const [[importRow]] = await pool.execute('SELECT id FROM imports WHERE id = ?', [currentImportId])
    if (!importRow) return response.status(404).json({ error: `Import ${currentImportId} was not found.` })

    const [rows] = await pool.execute(
      `WITH aggregated AS (
         SELECT COALESCE(NULLIF(TRIM(department), ''), 'Unspecified') AS department,
                COUNT(DISTINCT order_id) AS orders,
                COUNT(*) AS items,
                COUNT(DISTINCT product_id) AS products,
                AVG(reordered) * 100 AS reorderRate
         FROM order_lines WHERE import_id = ?
         GROUP BY COALESCE(NULLIF(TRIM(department), ''), 'Unspecified')
       )
       SELECT department, orders, items, products, ROUND(reorderRate, 1) AS reorderRate,
              ROW_NUMBER() OVER (ORDER BY items DESC, orders DESC, department ASC) AS rank
       FROM aggregated
       ORDER BY rank`,
      [currentImportId],
    )
    const numeric = (value) => {
      const number = Number(value ?? 0)
      return Number.isFinite(number) ? number : 0
    }
    return response.json(rows.map((row) => ({
      department: row.department || 'Unspecified',
      orders: numeric(row.orders),
      items: numeric(row.items),
      products: numeric(row.products),
      reorderRate: numeric(row.reorderRate),
      rank: numeric(row.rank),
    })))
  } catch (error) {
    return next(error)
  }
})

router.get('/behavior', async (request, response, next) => {
  const currentImportId = requireImportId(request, response)
  if (!currentImportId) return
  try {
    const [[importRow]] = await pool.execute('SELECT id FROM imports WHERE id = ?', [currentImportId])
    if (!importRow) return response.status(404).json({ error: `Import ${currentImportId} was not found.` })

    const [byDay] = await pool.execute(
      `SELECT order_dow AS day, COUNT(DISTINCT order_id) AS orders
       FROM order_lines WHERE import_id = ? AND order_dow BETWEEN 0 AND 6
       GROUP BY order_dow ORDER BY order_dow`,
      [currentImportId],
    )
    const [byHour] = await pool.execute(
      `SELECT order_hour_of_day AS hour, COUNT(DISTINCT order_id) AS orders
       FROM order_lines WHERE import_id = ? AND order_hour_of_day BETWEEN 0 AND 23
       GROUP BY order_hour_of_day ORDER BY order_hour_of_day`,
      [currentImportId],
    )
    const [heatmapRows] = await pool.execute(
      `SELECT order_dow AS day, order_hour_of_day AS hour,
              COUNT(DISTINCT order_id) AS orders
       FROM order_lines WHERE import_id = ?
         AND order_dow BETWEEN 0 AND 6 AND order_hour_of_day BETWEEN 0 AND 23
       GROUP BY order_dow, order_hour_of_day ORDER BY order_dow, order_hour_of_day`,
      [currentImportId],
    )
    const [basketRows] = await pool.execute(
      `SELECT order_id, COUNT(*) AS size
       FROM order_lines WHERE import_id = ? GROUP BY order_id ORDER BY size, order_id`,
      [currentImportId],
    )
    const [reorderRows] = await pool.execute(
      `SELECT reordered, COUNT(*) AS items
       FROM order_lines WHERE import_id = ? GROUP BY reordered ORDER BY reordered`,
      [currentImportId],
    )
    const [priorOrderRows] = await pool.execute(
      `SELECT days, COUNT(*) AS orders FROM (
         SELECT order_id, MIN(days_since_prior_order) AS days
         FROM order_lines WHERE import_id = ? AND days_since_prior_order IS NOT NULL
         GROUP BY order_id
       ) order_intervals
       GROUP BY days ORDER BY days`,
      [currentImportId],
    )
    const [[missing]] = await pool.execute(
      `SELECT COUNT(DISTINCT CASE WHEN order_dow IS NULL OR order_dow NOT BETWEEN 0 AND 6 THEN order_id END) AS missingDayOrders,
              COUNT(DISTINCT CASE WHEN order_hour_of_day IS NULL OR order_hour_of_day NOT BETWEEN 0 AND 23 THEN order_id END) AS missingHourOrders,
              COUNT(DISTINCT CASE WHEN days_since_prior_order IS NULL THEN order_id END) AS missingPriorOrderOrders
       FROM order_lines WHERE import_id = ?`,
      [currentImportId],
    )

    const numeric = (value) => {
      const number = Number(value ?? 0)
      return Number.isFinite(number) ? number : 0
    }
    const dayCounts = new Map(byDay.map((row) => [numeric(row.day), numeric(row.orders)]))
    const hourCounts = new Map(byHour.map((row) => [numeric(row.hour), numeric(row.orders)]))
    const heatmapCounts = new Map(heatmapRows.map((row) => [`${numeric(row.day)}:${numeric(row.hour)}`, numeric(row.orders)]))
    const sizes = basketRows.map((row) => numeric(row.size))
    const sizeCounts = new Map()
    for (const size of sizes) sizeCounts.set(size, (sizeCounts.get(size) || 0) + 1)
    const middle = Math.floor(sizes.length / 2)
    const median = sizes.length
      ? sizes.length % 2 ? sizes[middle] : (sizes[middle - 1] + sizes[middle]) / 2
      : 0

    return response.json({
      importId: currentImportId,
      ordersByDay: Array.from({ length: 7 }, (_value, day) => ({ day, orders: dayCounts.get(day) ?? 0 })),
      ordersByHour: Array.from({ length: 24 }, (_value, hour) => ({ hour, orders: hourCounts.get(hour) ?? 0 })),
      dayHour: Array.from({ length: 7 * 24 }, (_value, index) => {
        const day = Math.floor(index / 24)
        const hour = index % 24
        return { day, hour, orders: heatmapCounts.get(`${day}:${hour}`) ?? 0 }
      }),
      basketSizes: {
        min: sizes.length ? sizes[0] : 0,
        max: sizes.length ? sizes[sizes.length - 1] : 0,
        median: Number(median.toFixed(2)),
        average: sizes.length ? Number((sizes.reduce((sum, size) => sum + size, 0) / sizes.length).toFixed(2)) : 0,
        distribution: [...sizeCounts.entries()].sort(([a], [b]) => a - b).map(([size, orders]) => ({ size, orders })),
      },
      reorderItems: [0, 1].map((reordered) => ({
        reordered,
        items: numeric(reorderRows.find((row) => numeric(row.reordered) === reordered)?.items),
      })),
      daysSincePriorOrder: priorOrderRows.map((row) => ({
        days: numeric(row.days),
        orders: numeric(row.orders),
      })),
      missing: {
        dayOrders: numeric(missing.missingDayOrders),
        hourOrders: numeric(missing.missingHourOrders),
        priorOrderIntervalOrders: numeric(missing.missingPriorOrderOrders),
      },
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/reliability', async (request, response, next) => {
  const currentImportId = requireImportId(request, response)
  if (!currentImportId) return
  try {
    const [[importRow]] = await pool.execute(
      `SELECT id, original_filename AS source, status, total_rows AS totalRows,
              imported_rows AS validRows, skipped_rows AS skippedRows,
              validation_errors AS invalidRows, created_at AS createdAt
       FROM imports WHERE id = ?`,
      [currentImportId],
    )
    if (!importRow) return response.status(404).json({ error: `Import ${currentImportId} was not found.` })

    let invalidRows = importRow.invalidRows || []
    if (typeof invalidRows === 'string') {
      try { invalidRows = JSON.parse(invalidRows) } catch { invalidRows = [] }
    }
    if (!Array.isArray(invalidRows)) invalidRows = []

    let published = null
    try {
      const payload = await readAnalysisPayload()
      if (Number(payload.importId) === currentImportId) published = payload
    } catch (error) {
      if (error.statusCode !== 404 && error.statusCode !== 503) throw error
    }

    const numeric = (value) => {
      const number = Number(value ?? 0)
      return Number.isFinite(number) ? number : 0
    }
    const dataQuality = published?.dataQuality || {}
    const missingValues = dataQuality.missingValues && typeof dataQuality.missingValues === 'object'
      ? dataQuality.missingValues
      : {}
    const warnings = Array.isArray(dataQuality.warnings) ? [...dataQuality.warnings] : []
    const insufficientData = dataQuality.insufficientData ?? numeric(importRow.validRows) < 2
    if (!published) warnings.push('Analysis payload metadata is not available for this import.')
    if (numeric(importRow.skippedRows) > 0 && !warnings.some((warning) => warning.includes('invalid row'))) {
      warnings.push(`${numeric(importRow.skippedRows)} invalid row(s) were skipped during import.`)
    }
    if (insufficientData && !warnings.some((warning) => warning.includes('Insufficient'))) {
      warnings.push('Insufficient imported rows for meaningful association analysis.')
    }

    return response.json({
      importId: currentImportId,
      status: importRow.status,
      source: importRow.source,
      generatedAt: published?.generatedAt || importRow.createdAt,
      totalRows: numeric(importRow.totalRows),
      validRows: numeric(importRow.validRows),
      skippedRows: numeric(importRow.skippedRows),
      invalidRows,
      missingValues,
      parameters: published?.parameters || null,
      warnings,
      insufficientData: Boolean(insufficientData),
      analysis: published?.reliability || null,
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/bundles', async (request, response, next) => {
  const currentImportId = requireImportId(request, response)
  if (!currentImportId) return
  const minimumSupport = request.query.minSupport === undefined ? 0.05 : Number(request.query.minSupport)
  if (typeof request.query.minSupport !== 'undefined'
      && (typeof request.query.minSupport !== 'string' || !request.query.minSupport.trim()
        || !/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(request.query.minSupport)
        || !Number.isFinite(minimumSupport) || minimumSupport < 0 || minimumSupport > 1)) {
    return response.status(400).json({ error: 'minSupport must be a number between 0 and 1.' })
  }
  const limit = queryInteger(request.query.limit, 100, 1, 200, 'limit', response)
  if (limit === null) return
  try {
    const [[importRow]] = await pool.execute('SELECT id FROM imports WHERE id = ?', [currentImportId])
    if (!importRow) return response.status(404).json({ error: `Import ${currentImportId} was not found.` })

    const [rows] = await pool.execute(
      `WITH order_products AS (
         SELECT DISTINCT order_id, product_id, product_name
         FROM order_lines WHERE import_id = ?
       ), totals AS (
         SELECT COUNT(DISTINCT order_id) AS totalOrders FROM order_lines WHERE import_id = ?
       ), product_counts AS (
         SELECT product_id, product_name, COUNT(*) AS productOrders
         FROM order_products GROUP BY product_id, product_name
       )
         SELECT a.product_id AS productAId, a.product_name AS productA,
              b.product_id AS productBId, b.product_name AS productB,
              COUNT(*) / NULLIF(totals.totalOrders, 0) AS support,
              COUNT(*) / NULLIF(a_counts.productOrders, 0) AS confidenceA,
              COUNT(*) / NULLIF(b_counts.productOrders, 0) AS confidenceB,
              (COUNT(*) / NULLIF(totals.totalOrders, 0)) /
                NULLIF((a_counts.productOrders / NULLIF(totals.totalOrders, 0)) *
                       (b_counts.productOrders / NULLIF(totals.totalOrders, 0)), 0) AS lift
       FROM order_products a
       JOIN order_products b ON a.order_id = b.order_id AND a.product_id < b.product_id
       CROSS JOIN totals
       JOIN product_counts a_counts ON a.product_id = a_counts.product_id
       JOIN product_counts b_counts ON b.product_id = b_counts.product_id
       GROUP BY a.product_id, a.product_name, b.product_id, b.product_name,
                totals.totalOrders, a_counts.productOrders, b_counts.productOrders
       HAVING support >= ? AND support IS NOT NULL AND confidenceA IS NOT NULL
              AND confidenceB IS NOT NULL AND lift IS NOT NULL
       ORDER BY lift DESC, support DESC, productAId ASC, productBId ASC
       LIMIT ?`,
      [currentImportId, currentImportId, minimumSupport, limit],
    )
    const numeric = (value) => {
      const result = Number(value)
      return Number.isFinite(result) ? result : null
    }
    const validRows = rows.filter((row) => [row.productAId, row.productBId,
      row.support, row.confidenceA, row.confidenceB, row.lift]
      .every((value) => numeric(value) !== null))
    const rankedRows = validRows.map((row, index) => {
      const productAId = numeric(row.productAId)
      const productBId = numeric(row.productBId)
      return {
        rank: index + 1,
        productAId,
        productA: row.productA || 'Unknown product',
        productBId,
        productB: row.productB || 'Unknown product',
        support: numeric(row.support),
        confidenceA: numeric(row.confidenceA),
        confidenceB: numeric(row.confidenceB),
        lift: numeric(row.lift),
      }
    })
    const visualizationRows = rankedRows.map((row) => ({
      ...row,
      source: row.productAId,
      target: row.productBId,
    }))
    response.set({ 'X-Min-Support': String(minimumSupport), 'X-Result-Limit': String(limit) })
    return response.json(visualizationRows)
  } catch (error) {
    return next(error)
  }
})

export default router
