/* ─── 🏅 Fidelidade ⇄ VittaSys ────────────────────────────────────────────────
   Pedido do master (14/08/2026): "os clientes fidelidade do VittaSys precisam
   aparecer no VittaHub, pois preciso agendar todos por lá."

   O VittaSys é onde o cadastro nasce (tipo_cliente = 'fidelidade'); a pasta
   "Clientes Fidelidade" do Hub é onde a equipe agenda e conversa. Antes, só
   aparecia aqui quem alguém classificasse NA MÃO — cliente novo da Poliana
   ficava invisível pra Raylane e Stefany. Este serviço puxa a lista completa
   pela ponte (GET /api/integracao/fidelidade) e garante cada um na pasta.

   Decisões que importam:
   - Procura a conversa pelo TELEFONE (qualquer formato/provider), não pelo
     contact_id — o Z-API tem sufixo próprio e não podemos duplicar conversa
     de quem já fala com a clínica.
   - COALESCE em tudo: nunca sobrescreve nome, classificação, setor ou dono
     que a equipe já definiu. Sincronizar de novo é sempre inofensivo.
   - NÃO cria lead: cliente fidelidade é cliente da casa, não negociação —
     criar lead aqui despejaria centenas de cards no funil de vendas. Se a
     conversa já tem lead, aproveitamos só pra completar o nascimento.
   - Mexer no cadastro continua sendo no VittaSys (ponte é só leitura). */
import { query } from '../db/pool.js';
import { socketEmit } from '../socketServer.js';

const CHAVE_STATUS = 'fidelidade_sync_vittasys';

/* O Inbox serve as conversas de um CACHE em memória (convoCache) — inserir só
   no banco deixaria os clientes invisíveis até o próximo restart (bug pego no
   teste local). O inbox nos entrega o cacheUpdate dele por injeção, no mesmo
   padrão setXxxFn do socketServer, para não criar import circular. */
let avisarCacheConversa = null;
export function setAvisarCacheConversaFidelidade(fn) { avisarCacheConversa = fn; }
function conversaMudou(conv) {
  if (!conv) return;
  try { if (avisarCacheConversa) avisarCacheConversa(conv); } catch (_) {}
  try { socketEmit('conv_categoria', { convId: conv.id, categoria: conv.categoria }); } catch (_) {}
}

export const pontePronta = () =>
  !!(process.env.VITTASYS_API_URL && process.env.INTEGRACAO_TOKEN && process.env.INTEGRACAO_TOKEN.length >= 16);

const AVISO_ENV = 'Ponte com o VittaSys não configurada: faltam VITTASYS_API_URL e/ou INTEGRACAO_TOKEN (16+ caracteres) no Railway.';

async function chamarVittasys(caminho) {
  const { default: fetch } = await import('node-fetch');
  const base = String(process.env.VITTASYS_API_URL).replace(/\/+$/, '');
  const vr = await fetch(`${base}${caminho}`, {
    headers: { 'x-integracao-token': process.env.INTEGRACAO_TOKEN },
    signal: AbortSignal.timeout(20000),
  });
  if (!vr.ok) {
    const txt = await vr.text().catch(() => '');
    throw new Error(`Vittasys respondeu ${vr.status}${txt ? `: ${txt.slice(0, 120)}` : ''}`);
  }
  return vr.json();
}

export async function ultimaSincronizacaoFidelidade() {
  const { rows: [r] } = await query(
    `SELECT valor FROM configuracoes WHERE chave = $1`, [CHAVE_STATUS]).catch(() => ({ rows: [] }));
  return r?.valor || null;
}

export async function sincronizarFidelidadeVittasys(origem = 'automática') {
  if (!pontePronta()) return { ok: false, configurado: false, aviso: AVISO_ENV };
  const d = await chamarVittasys('/api/integracao/fidelidade');
  const clientes = Array.isArray(d?.clientes) ? d.clientes : [];

  let criadas = 0, movidas = 0, jaOk = 0, semTelefone = 0, nascimentos = 0, erros = 0;
  for (const c of clientes) {
    try {
      const tel = String(c.telefone || '').replace(/\D/g, '');
      if (tel.length < 10) { semTelefone++; continue; }
      const full = tel.startsWith('55') ? tel : '55' + tel;

      // 1) Já existe conversa com esse telefone? (compara só dígitos, pelo fim
      //    do número — sobrevive a +55, DDD com parêntese e ao 9 do celular)
      const fim = full.slice(-10);
      const { rows: cands } = await query(
        `SELECT id, phone, contact_name, categoria, classificacao, setor, lead_id
           FROM conversas
          WHERE regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') LIKE $1
          ORDER BY last_message_at DESC NULLS LAST LIMIT 5`, ['%' + fim]);
      const bate = (p) => { const dig = String(p || '').replace(/\D/g, ''); return dig && (dig.endsWith(tel) || tel.endsWith(dig) || dig.endsWith(full) || full.endsWith(dig)); };
      let conv = cands.find((x) => bate(x.phone)) || null;

      if (!conv) {
        // 2) Não existe: nasce direto na pasta, no padrão do cadastro manual
        const contactId = `${full}@s.whatsapp.net`;
        const { rows: [nova] } = await query(`
          INSERT INTO conversas (contact_id, phone, contact_name, channel, last_message, last_message_at,
                                 unread, status_atend, provider, categoria, categoria_em, classificacao, setor)
          VALUES ($1, $2, NULLIF($3,''), 'whatsapp', 'Cliente Fidelidade trazido do VittaSys', NOW(),
                  0, 'aberto', 'manual', 'fidelidade', NOW(), 'fidelidade', 'vacinas')
          ON CONFLICT (contact_id) DO UPDATE SET
            contact_name  = COALESCE(conversas.contact_name, NULLIF($3,'')),
            categoria     = COALESCE(conversas.categoria, 'fidelidade'),
            categoria_em  = COALESCE(conversas.categoria_em, NOW()),
            classificacao = COALESCE(conversas.classificacao, 'fidelidade'),
            setor         = COALESCE(conversas.setor, 'vacinas')
          RETURNING *, (xmax = 0) AS criada`,
          [contactId, full, String(c.nome || '').slice(0, 80)]);
        conv = nova;
        if (nova?.criada) criadas++; else movidas++;
        conversaMudou(nova);
      } else if (conv.categoria !== 'fidelidade') {
        // 3) Existe mas está fora da pasta: entra, sem apagar o que a equipe fez
        const { rows: [movida] } = await query(`
          UPDATE conversas SET
            categoria     = 'fidelidade',
            categoria_em  = COALESCE(categoria_em, NOW()),
            classificacao = COALESCE(classificacao, 'fidelidade'),
            setor         = COALESCE(setor, 'vacinas'),
            contact_name  = COALESCE(contact_name, NULLIF($2,''))
          WHERE id = $1 RETURNING *`, [conv.id, String(c.nome || '').slice(0, 80)]);
        movidas++;
        conversaMudou(movida);
      } else {
        jaOk++;
      }

      // Nascimento de presente — é ele que destrava a carteira vacinal (sem
      // ele o painel não sabe qual dose vem e fica cobrando "falta cadastrar").
      // Vai para a MEMÓRIA da conversa (o resumo já lê memoria.nascimento);
      // não criamos leads (ver cabeçalho), mas se um já existir, completa nele.
      if (conv && c.nascimento && /^\d{4}-\d{2}-\d{2}$/.test(String(c.nascimento))) {
        const { rows: [comNasc] } = await query(
          `UPDATE conversas SET memoria = jsonb_set(COALESCE(memoria,'{}'::jsonb), '{nascimento}', to_jsonb($2::text))
            WHERE id = $1 AND COALESCE(memoria->>'nascimento','') = '' RETURNING *`,
          [conv.id, String(c.nascimento)]).catch(() => ({ rows: [] }));
        if (comNasc) { nascimentos++; conversaMudou(comNasc); }
        if (conv.lead_id) {
          await query(`UPDATE leads SET nascimento = $1::date WHERE id = $2 AND nascimento IS NULL`,
            [c.nascimento, conv.lead_id]).catch(() => {});
        }
      }
      if (conv?.lead_id && c.id) {
        await query(`UPDATE leads SET vittasys_id = COALESCE(vittasys_id, $1) WHERE id = $2`,
          [String(c.id), conv.lead_id]).catch(() => {});
      }
    } catch (e) {
      erros++;
      console.error(`Sync fidelidade (cliente ${c?.id || '?'}):`, e.message);
    }
  }

  const resultado = { ok: true, configurado: true, origem, em: new Date().toISOString(),
    total: clientes.length, criadas, movidas, ja_ok: jaOk, sem_telefone: semTelefone, nascimentos, erros };
  await query(`INSERT INTO configuracoes (chave, valor) VALUES ($1, $2)
               ON CONFLICT (chave) DO UPDATE SET valor = $2, updated_at = NOW()`,
    [CHAVE_STATUS, JSON.stringify(resultado)]).catch(() => {});
  return resultado;
}
