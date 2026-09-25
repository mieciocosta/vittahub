import pg from 'pg';
const { Pool } = pg;

/* ─── DATA PURA (DATE) SEMPRE COMO TEXTO "AAAA-MM-DD" ─────────────────────────
   Sem isto, o driver devolve uma coluna DATE como objeto Date do JS. Aí
   String(valor).slice(0,10) — padrão usado no sistema inteiro — vira
   "Wed Aug 12" e a tela mostra o famoso "Invalid Date" (foi o que aconteceu no
   relatório de solicitação de vacinas e na data de nascimento do bebê).
   Só mexemos no tipo DATE (OID 1082): TIMESTAMP/TIMESTAMPTZ seguem iguais,
   porque hora e fuso continuam importando neles. */
pg.types.setTypeParser(1082, (v) => v);   // 1082 = date

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => console.error('Pool error:', err.message));

/* 🧯 NINGUÉM ESPERA TRAVA PRA SEMPRE (25/09, "não estamos conseguindo entrar").
   A cada subida as migrações fazem ALTER TABLE ... IF NOT EXISTS, que pede
   trava EXCLUSIVA da tabela mesmo quando a coluna já existe. Se uma consulta
   pesada (ou presa, de uma versão anterior derrubada no meio) está lendo a
   tabela, o ALTER fica esperando, e TODA consulta nova naquela tabela entra na
   fila atrás dele: login, lista de conversas, tudo. O servidor subia, atendia
   por 30 s e travava. Com lock_timeout, quem espera trava desiste em 5 s com
   erro (a migração tem .catch e segue; a coluna já existe) e a fila anda. */
pool.on('connect', (client) => {
  client.query("SET lock_timeout = '5s'").catch(() => {});
});

export async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error('Query error:', err.message, '\nSQL:', text.slice(0, 100));
    throw err;
  }
}

export default pool;
