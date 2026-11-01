import { parse } from 'csv-parse/sync'
import pool, { withTransaction } from '../config/database.js'

const requiredColumns = [
  'order_id',
  'user_id',
  'product_id',
  'product_name',
  'department',
]

function numberOrNull(value) {
  if (value === undefined || value === null || value.trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function validateRow(row, rowNumber) {
  const errors = []
  const requiredNumeric = ['order_id', 'user_id', 'product_id']
  for (const column of requiredNumeric) {
    if (!Number.isInteger(Number(row[column]))) errors.push(`${column} must be an integer`)
  }
  if (!row.product_name?.trim()) errors.push('product_name is required')
  if (!row.department?.trim()) errors.push('department is required')
  const orderDow = numberOrNull(row.order_dow)
  if (orderDow !== null && (!Number.isInteger(orderDow) || orderDow < 0 || orderDow > 6)) {
    errors.push('order_dow must be between 0 and 6')
  }
  const hour = numberOrNull(row.order_hour_of_day)
  if (hour !== null && (!Number.isInteger(hour) || hour < 0 || hour > 23)) {
    errors.push('order_hour_of_day must be between 0 and 23')
  }
  return errors.length ? { row: rowNumber, errors } : null
}

export async function importOrders(file) {
  let records
  try {
    records = parse(file.buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true })
  } catch (error) {
    const parseError = new Error(`Could not parse CSV: ${error.message}`)
    parseError.statusCode = 400
    throw parseError
  }

  const columns = records.length ? Object.keys(records[0]) : []
  const missingColumns = requiredColumns.filter((column) => !columns.includes(column))
  if (missingColumns.length) {
    const error = new Error(`Missing required columns: ${missingColumns.join(', ')}`)
    error.statusCode = 400
    throw error
  }

  const validationErrors = records
    .map((row, index) => validateRow(row, index + 2))
    .filter(Boolean)

  const validRows = records.filter((_row, index) => !validationErrors.some((item) => item.row === index + 2))
  const result = await withTransaction(async (connection) => {
    const [importResult] = await connection.execute(
      `INSERT INTO imports (original_filename, total_rows, skipped_rows, validation_errors)
       VALUES (?, ?, ?, ?)`,
      [file.originalname, records.length, validationErrors.length, JSON.stringify(validationErrors)],
    )
    const importId = importResult.insertId

    for (const row of validRows) {
      await connection.execute(
        `INSERT INTO order_lines
          (import_id, order_id, user_id, order_number, order_dow, order_hour_of_day,
           days_since_prior_order, product_id, product_name, department, reordered, add_to_cart_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          importId,
          Number(row.order_id),
          Number(row.user_id),
          numberOrNull(row.order_number),
          numberOrNull(row.order_dow),
          numberOrNull(row.order_hour_of_day),
          numberOrNull(row.days_since_prior_order),
          Number(row.product_id),
          row.product_name.trim(),
          row.department.trim(),
          Number(row.reordered) === 1 ? 1 : 0,
          numberOrNull(row.add_to_cart_order),
        ],
      )
    }

    await connection.execute(
      `UPDATE imports SET imported_rows = ?, status = 'completed' WHERE id = ?`,
      [validRows.length, importId],
    )
    return importId
  })

  return {
    importId: result,
    filename: file.originalname,
    totalRows: records.length,
    importedRows: validRows.length,
    skippedRows: validationErrors.length,
    validationErrors,
  }
}

export async function getLatestImport() {
  const [rows] = await pool.query(
    `SELECT id, original_filename AS filename, status, total_rows AS totalRows,
            imported_rows AS importedRows, skipped_rows AS skippedRows, created_at AS createdAt
     FROM imports ORDER BY id DESC LIMIT 1`,
  )
  return rows[0] || null
}
