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

router.get('/summary', async (request, response, next) => {
  const currentImportId = requireImportId(request, response)
  if (!currentImportId) return
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(DISTINCT order_id) AS orders,
              COUNT(DISTINCT user_id) AS customers,
              COUNT(*) AS items,
              COUNT(DISTINCT product_id) AS products,
              ROUND(AVG(order_size), 2) AS averageBasketSize,
              ROUND(AVG(reordered) * 100, 1) AS reorderRate
       FROM (
         SELECT order_id, user_id, COUNT(*) AS order_size,
                AVG(reordered) AS reordered
         FROM order_lines WHERE import_id = ? GROUP BY order_id, user_id
       ) baskets`,
      [currentImportId],
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
  const minimumSupport = Math.max(Number(request.query.minSupport) || 0.05, 0)
  try {
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
              COUNT(*) / totals.totalOrders AS support,
              COUNT(*) / a_counts.productOrders AS confidenceA,
              COUNT(*) / b_counts.productOrders AS confidenceB,
              (COUNT(*) / totals.totalOrders) /
                ((a_counts.productOrders / totals.totalOrders) * (b_counts.productOrders / totals.totalOrders)) AS lift
       FROM order_products a
       JOIN order_products b ON a.order_id = b.order_id AND a.product_id < b.product_id
       CROSS JOIN totals
       JOIN product_counts a_counts ON a.product_id = a_counts.product_id
       JOIN product_counts b_counts ON b.product_id = b_counts.product_id
       GROUP BY a.product_id, a.product_name, b.product_id, b.product_name,
                totals.totalOrders, a_counts.productOrders, b_counts.productOrders
       HAVING support >= ?
       ORDER BY lift DESC, support DESC
       LIMIT 100`,
      [currentImportId, currentImportId, minimumSupport],
    )
    return response.json(rows)
  } catch (error) {
    return next(error)
  }
})

export default router
