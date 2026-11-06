import { Router } from 'express'
import pool from '../config/database.js'
import { getAnalysisPayloadStatus, readAnalysisPayload, saveAnalysisPayload } from '../services/analysisPayload.js'

const router = Router()

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

function importId(request) {
  const value = Number(request.query.importId)
  return Number.isInteger(value) && value > 0 ? value : null
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
    return response.json({ ...rows[0], byDay, byHour })
  } catch (error) {
    return next(error)
  }
})

router.get('/products', async (request, response, next) => {
  const currentImportId = requireImportId(request, response)
  if (!currentImportId) return
  try {
    const [rows] = await pool.execute(
      `SELECT product_id AS productId, product_name AS productName, department,
              COUNT(DISTINCT order_id) AS orders,
              COUNT(*) AS units,
              ROUND(AVG(reordered) * 100, 1) AS reorderRate
       FROM order_lines WHERE import_id = ?
       GROUP BY product_id, product_name, department
       ORDER BY orders DESC, units DESC`,
      [currentImportId],
    )
    return response.json(rows)
  } catch (error) {
    return next(error)
  }
})

router.get('/departments', async (request, response, next) => {
  const currentImportId = requireImportId(request, response)
  if (!currentImportId) return
  try {
    const [rows] = await pool.execute(
      `SELECT department, COUNT(DISTINCT order_id) AS orders, COUNT(*) AS items,
              COUNT(DISTINCT product_id) AS products,
              ROUND(AVG(reordered) * 100, 1) AS reorderRate
       FROM order_lines WHERE import_id = ?
       GROUP BY department ORDER BY items DESC`,
      [currentImportId],
    )
    return response.json(rows)
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
