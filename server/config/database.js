import mysql from 'mysql2/promise'
import 'dotenv/config'

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cartsense',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  dateStrings: true,
})

export async function checkDatabase() {
  const [rows] = await pool.query('SELECT 1 AS connected')
  return rows[0]?.connected === 1
}

export async function withTransaction(callback) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await callback(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export default pool
