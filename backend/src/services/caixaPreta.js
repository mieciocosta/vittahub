/* ✈️ CAIXA-PRETA DO SERVIDOR (25/09, "O CRM está caindo toda hora").
   Sem acesso aos registros do Railway, ninguém sabia dizer se o CRM caía por
   ATUALIZAÇÃO (deploy: o Railway desliga o servidor velho com aviso, SIGTERM)
   ou por QUEDA de verdade (falta de memória ou travamento: o processo morre
   sem aviso). A cada minuto o servidor grava um batimento (versão, memória,
   conexões do banco); ao desligar com aviso, grava que foi desligado. No boot
   seguinte ele lê o último batimento e sabe o que aconteceu:
     · teve aviso de desligamento → atualização/religar (normal);
     · não teve aviso → QUEDA: guarda a memória do último minuto e avisa o
       master (só ele vê).
   O histórico fica em configuracoes.servidor_quedas (últimos 50) e aparece em
   /api/versao. Leve de propósito: 1 gravação por minuto. */
import { query } from '../db/pool.js';

const COMMIT = () => (process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 7) || 'local';
const mb = (b) => Math.round(b / 1048576);
let poolRef = null;

function retrato(extra = {}) {
  const m = process.memoryUsage();
  return {
    commit: COMMIT(), em: new Date().toISOString(), no_ar_min: Math.round(process.uptime() / 60),
    memoria_mb: mb(m.rss), heap_mb: mb(m.heapUsed),
    banco: poolRef ? { total: poolRef.totalCount, livres: poolRef.idleCount, esperando: poolRef.waitingCount } : null,
    ...extra,
  };
}

const gravar = (chave, obj) => query(
  `INSERT INTO configuracoes (chave, valor) VALUES ($1, $2::jsonb)
   ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`, [chave, JSON.stringify(obj)]);

export async function historicoQuedas() {
  const { rows: [q] } = await query(`SELECT valor FROM configuracoes WHERE chave = 'servidor_quedas'`).catch(() => ({ rows: [] }));
  return Array.isArray(q?.valor) ? q.valor : [];
}

export async function iniciarCaixaPreta(pool) {
  poolRef = pool;
  try {
    const { rows: [b] } = await query(`SELECT valor FROM configuracoes WHERE chave = 'servidor_batimento'`);
    const ultimo = b?.valor;
    if (ultimo?.em) {
      const reinicio = {
        quando: new Date().toISOString(),
        ultimo_sinal: ultimo.em,
        tipo: ultimo.desligado_com_aviso ? 'atualizacao' : 'queda',
        versao_antes: ultimo.commit, versao_agora: COMMIT(),
        ficou_no_ar_min: ultimo.no_ar_min, memoria_mb: ultimo.memoria_mb, heap_mb: ultimo.heap_mb, banco: ultimo.banco,
      };
      const lista = [reinicio, ...(await historicoQuedas())].slice(0, 50);
      await gravar('servidor_quedas', lista);
      if (reinicio.tipo === 'queda') {
        console.error(`✈️ CAIXA-PRETA: o servidor anterior caiu SEM aviso (${ultimo.memoria_mb} MB de memória no último minuto, ${ultimo.no_ar_min} min no ar)`);
        await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('alerta', $1, $2, true)`,
          ['🛑 O servidor do CRM caiu e voltou sozinho',
           `Queda sem aviso às ${new Date(ultimo.em).toLocaleTimeString('pt-BR', { timeZone: 'America/Fortaleza' })} (horário de São Luís), depois de ${ultimo.no_ar_min} min no ar. Memória no último minuto: ${ultimo.memoria_mb} MB. Conexões do banco: ${ultimo.banco ? `${ultimo.banco.total} abertas, ${ultimo.banco.esperando} esperando` : 'sem leitura'}. O registro completo fica em /api/versao.`]).catch(() => {});
      } else {
        console.log(`✈️ Caixa-preta: reinício por atualização (${ultimo.commit} → ${COMMIT()})`);
      }
    }
  } catch (e) { console.error('caixa-preta (leitura):', e.message); }

  const bater = () => gravar('servidor_batimento', retrato()).catch(() => {});
  bater();
  setInterval(bater, 60 * 1000).unref();

  // O Railway avisa antes de desligar (deploy, religar): anota e sai.
  let saindo = false;
  const aoDesligar = (sinal) => {
    if (saindo) return; saindo = true;
    const fim = setTimeout(() => process.exit(0), 2000);
    gravar('servidor_batimento', retrato({ desligado_com_aviso: sinal }))
      .catch(() => {}).finally(() => { clearTimeout(fim); process.exit(0); });
  };
  process.once('SIGTERM', () => aoDesligar('SIGTERM'));
  process.once('SIGINT', () => aoDesligar('SIGINT'));
}
