import pg from 'pg';
const { Pool } = pg;

// Use DATABASE_URL from Railway (preferred) or individual env vars
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const dur = Date.now() - start;
    if (dur > 1000) console.warn(`Slow query (${dur}ms): ${text.slice(0, 80)}`);
    return res;
  } catch (err) {
    console.error('DB query error:', err.message, '\nSQL:', text.slice(0, 120));
    throw err;
  }
}

export async function getClient() {
  return pool.connect();
}

export default pool;
