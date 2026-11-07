import { parse } from 'csv-parse/sync'
import pool, { withTransaction } from '../config/database.js'

const duplicateConstraintName = 'order_lines_import_order_product_idx'

const requiredColumns = [
  'order_id',
  'user_id',
  'product_id',
  'product_name',
  'department',
]
const insertBatchSize = 1000
const orderLineColumns = 12

function stageError(error, stage) {
  if (!error.stage) error.stage = stage
  return error
}

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
    parseError.stage = 'csv_parsing'
    throw parseError
  }

  const columns = records.length ? Object.keys(records[0]) : []
  const missingColumns = requiredColumns.filter((column) => !columns.includes(column))
  if (missingColumns.length) {
    const error = new Error(`Missing required columns: ${missingColumns.join(', ')}`)
    error.statusCode = 400
    error.stage = 'csv_parsing'
    throw error
  }

  const validationErrors = records
    .map((row, index) => validateRow(row, index + 2))
    .filter(Boolean)

  const validRows = records.filter((_row, index) => !validationErrors.some((item) => item.row === index + 2))
  let result
  try {
    await removeLegacyDuplicateConstraint()
    result = await withTransaction(async (connection) => {
    const [importResult] = await connection.execute(
      `INSERT INTO imports (original_filename, total_rows, skipped_rows, validation_errors)
       VALUES (?, ?, ?, ?)`,
      [file.originalname, records.length, validationErrors.length, JSON.stringify(validationErrors)],
    )
    const importId = importResult.insertId

      const columns = `(import_id, order_id, user_id, order_number, order_dow, order_hour_of_day,
        days_since_prior_order, product_id, product_name, department, reordered, add_to_cart_order)`
      for (let offset = 0; offset < validRows.length; offset += insertBatchSize) {
        const batch = validRows.slice(offset, offset + insertBatchSize)
        const placeholders = batch.map(() => `(${Array(orderLineColumns).fill('?').join(', ')})`).join(', ')
        const values = batch.flatMap((row) => [
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
        ])
        await connection.execute(`INSERT INTO order_lines ${columns} VALUES ${placeholders}`, values)
      }

    await connection.execute(
      `UPDATE imports SET imported_rows = ?, status = 'completed' WHERE id = ?`,
      [validRows.length, importId],
    )
    return importId
    })
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_DB_ERROR') {
      error.stage = 'database_initialization'
      if (error.code === 'ER_NO_SUCH_TABLE') {
        error.message = 'CartSense database tables are not initialized. Run server/sql/schema.sql in MySQL or phpMyAdmin, then retry the upload.'
        error.statusCode = 503
      }
      throw error
    }
    throw stageError(error, 'database_import')
  }

  return {
    importId: result,
    filename: file.originalname,
    totalRows: records.length,
    importedRows: validRows.length,
    skippedRows: validationErrors.length,
    validationErrors,
  }
}

async function removeLegacyDuplicateConstraint() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS constraintCount
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'order_lines'
       AND index_name = ?
       AND non_unique = 0`,
    [duplicateConstraintName],
  )
  if (Number(rows[0]?.constraintCount) === 0) return

  await pool.query(`ALTER TABLE order_lines DROP INDEX ${duplicateConstraintName}`)
}

export async function getLatestImport() {
  const [rows] = await pool.query(
    `SELECT id, original_filename AS filename, status, total_rows AS totalRows,
            imported_rows AS importedRows, skipped_rows AS skippedRows, created_at AS createdAt
     FROM imports ORDER BY id DESC LIMIT 1`,
  )
  return rows[0] || null
}
