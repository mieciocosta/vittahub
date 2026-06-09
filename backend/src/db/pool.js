import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => console.error('Pool error:', err.message));

export async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error('Query error:', err.message, '\nSQL:', text.slice(0, 100));
    throw err;
  }
}

export default pool;
