import React, { useEffect, useState } from 'react';
import { Trophy, RefreshCw } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* 🏆 RANKING — o pódio da equipe, por QUANTIDADE de vendas.
   Pedido do master, e a regra dele é a alma da tela: aqui NÃO existe valor em
   R$. Quantidade todo mundo compara sem constrangimento ("fechou 8, fechei 5");
   valor exporia o faturamento de cada colega, que é assunto do master.
   O pódio é dentro do SETOR — consultas fecha 10 por dia e vacina fecha 1
   Plano; misturar os dois humilharia justamente quem vende o item mais caro. */

const PERIODOS = [['hoje', 'Hoje'], ['semana', 'Últimos 7 dias'], ['mes', 'Este mês']];
const SETOR_INFO = {
  vacinas: { rotulo: 'Vacinas', emoji: '💉', cor: '#7c5cbf' },
  consultas: { rotulo: 'Consultas', emoji: '🩺', cor: '#00B8C0' },
  terapias: { rotulo: 'Terapias', emoji: '🧩', cor: '#C4973B' },
};
const MEDALHA = { 1: '🥇', 2: '🥈', 3: '🥉' };
// Alturas do pódio: o 1º lugar precisa ser visivelmente mais alto
const DEGRAU = { 1: 96, 2: 68, 3: 50 };
const ORDEM_PODIO = [2, 1, 3];   // prata à esquerda, ouro no meio, bronze à direita

const Avatar = ({ p, tam }) => (
  p.avatar
    ? <img src={p.avatar} alt="" style={{ width: tam, height: tam, borderRadius: '50%', objectFit: 'cover', border: '2.5px solid rgba(255,255,255,.85)' }} />
    : <div style={{ width: tam, height: tam, borderRadius: '50%', background: p.cor || 'var(--tq)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: tam * .36,
        border: '2.5px solid rgba(255,255,255,.85)' }}>{fmt.initials(p.nome)}</div>
);

export default function Ranking() {
  const api = useApi();
  const { user } = useAuth();
  const [periodo, setPeriodo] = useState('mes');
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  const carregar = (p = periodo) => {
    setCarregando(true); setErro('');
    api.get(`/extras/ranking?periodo=${p}`)
      .then(d => setDados(d))
      .catch(e => setErro(e.message || 'Não consegui carregar o ranking.'))
      .finally(() => setCarregando(false));
  };

  useEffect(() => { carregar(periodo); /* recarrega a cada 2 min pra ficar vivo */
    const t = setInterval(() => carregar(periodo), 120000);
    return () => clearInterval(t);
  }, [periodo]); // eslint-disable-line

  const rotuloPeriodo = (PERIODOS.find(p => p[0] === periodo) || [])[1];

  return (
    <div style={{ padding: '22px 28px 40px' }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ width: 46, height: 46, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg,#f59e0b,#fcd34d)', boxShadow: '0 6px 18px rgba(245,158,11,.4)' }}>
          <Trophy size={23} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 21, fontWeight: 900, margin: 0 }}>Ranking da equipe</h1>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            Por <b>quantidade de vendas fechadas</b> — sem valores. {rotuloPeriodo}.
          </div>
        </div>
        <button onClick={() => carregar()} className="btn btn-sm" title="Atualizar agora"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={13} className={carregando ? 'spin' : ''} /> Atualizar
        </button>
      </div>

      {/* Período */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {PERIODOS.map(([k, rot]) => (
          <button key={k} onClick={() => setPeriodo(k)}
            style={{ padding: '7px 15px', borderRadius: 11, fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
              border: `1.5px solid ${periodo === k ? 'var(--tq)' : 'var(--border)'}`,
              background: periodo === k ? 'var(--tq)' : 'var(--card)',
              color: periodo === k ? '#fff' : 'var(--txt2)' }}>
            {rot}
          </button>
        ))}
      </div>

      {erro && (
        <div className="card" style={{ padding: 18, borderLeft: '4px solid var(--err,#dc2626)', marginBottom: 18 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>Não consegui carregar o ranking</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>{erro}</div>
          <button onClick={() => carregar()} className="btn btn-sm">Tentar de novo</button>
        </div>
      )}

      {dados?.aviso && (
        <div className="card" style={{ padding: 16, borderLeft: '4px solid #f59e0b', marginBottom: 18, fontSize: 13 }}>
          ⚠️ {dados.aviso}
        </div>
      )}

      {carregando && !dados && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <span className="spin" style={{ width: 26, height: 26, borderColor: 'rgba(0,184,192,.2)', borderTopColor: 'var(--tq)' }} />
        </div>
      )}

      {(dados?.setores || []).map((bloco) => {
        const info = SETOR_INFO[bloco.setor] || { rotulo: bloco.setor, emoji: '🎯', cor: '#0E8C96' };
        const podio = bloco.itens.filter(x => x.pos <= 3).slice(0, 3);
        const restante = bloco.itens.filter(x => !podio.includes(x));
        const ninguemVendeu = bloco.total === 0;

        return (
          <div key={bloco.setor} style={{ marginBottom: 26 }}>

            {/* Faixa do setor */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <span style={{ fontSize: 17 }}>{info.emoji}</span>
              <span style={{ fontWeight: 900, fontSize: 16 }}>{info.rotulo}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: '#fff', background: info.cor, borderRadius: 20, padding: '3px 11px' }}>
                {bloco.total} venda{bloco.total === 1 ? '' : 's'} no período
              </span>
              {/* A frase que faz correr: quanto falta pra passar a líder */}
              {bloco.minhaPos && (
                <span style={{ fontSize: 12, fontWeight: 800, color: bloco.minhaPos === 1 ? 'var(--ok,#16a34a)' : 'var(--txt2)' }}>
                  {bloco.minhaPos === 1
                    ? '👑 Você está em 1º — segura a liderança!'
                    : `Você está em ${bloco.minhaPos}º · faltam ${bloco.paraLiderar} venda${bloco.paraLiderar === 1 ? '' : 's'} pra liderar 🔥`}
                </span>
              )}
            </div>

            {ninguemVendeu ? (
              <div className="card" style={{ padding: '28px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 30, marginBottom: 6 }}>🏁</div>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>Ninguém pontuou ainda {periodo === 'hoje' ? 'hoje' : 'no período'}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>A primeira venda leva o 1º lugar. Pode ser a sua. 🚀</div>
              </div>
            ) : (
              <>
                {/* 🏆 O PÓDIO */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 14, flexWrap: 'wrap',
                  padding: '26px 18px 0',
                  background: 'linear-gradient(180deg, rgba(245,158,11,.14), rgba(245,158,11,0))' }}>
                  {ORDEM_PODIO.map((lugar) => {
                    const p = podio.find(x => x.pos === lugar) || podio[lugar - 1];
                    if (!p) return null;
                    const ouro = lugar === 1;
                    const corDeg = ouro ? 'linear-gradient(180deg,#fcd34d,#f59e0b)'
                      : lugar === 2 ? 'linear-gradient(180deg,#e5e7eb,#9ca3af)'
                        : 'linear-gradient(180deg,#f3c99b,#b45309)';
                    return (
                      <div key={lugar} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 128 }}>
                        {ouro && <div style={{ fontSize: 22, marginBottom: -4 }}>👑</div>}
                        <div style={{ position: 'relative', marginBottom: 7 }}>
                          <Avatar p={p} tam={ouro ? 66 : 52} />
                          <span style={{ position: 'absolute', right: -6, bottom: -4, fontSize: ouro ? 24 : 20 }}>{MEDALHA[lugar]}</span>
                        </div>
                        <div style={{ fontWeight: 900, fontSize: ouro ? 14 : 13, textAlign: 'center', lineHeight: 1.15,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 124 }}>
                          {(p.nome || '').split(' ')[0]}
                          {p.voce && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--tq2)' }}> (você)</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
                          {p.hoje > 0 ? `${p.hoje} hoje` : 'nada hoje'}
                        </div>
                        {/* O degrau */}
                        <div style={{ width: '100%', height: DEGRAU[lugar], borderRadius: '12px 12px 0 0', background: corDeg,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 -3px 14px rgba(0,0,0,.14)', color: '#3b2a00' }}>
                          <div style={{ fontSize: ouro ? 30 : 24, fontWeight: 900, lineHeight: 1 }}>{p.n}</div>
                          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5 }}>
                            venda{p.n === 1 ? '' : 's'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Lista completa — todo mundo se acha, inclusive quem está zerado */}
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  {bloco.itens.map((p, i) => {
                    const max = bloco.itens[0]?.n || 1;
                    const pct = max ? Math.min((p.n / max) * 100, 100) : 0;
                    return (
                      <div key={p.id || i}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
                          borderBottom: i < bloco.itens.length - 1 ? '1px solid var(--border)' : 'none',
                          background: p.voce ? 'var(--tq4)' : 'transparent' }}>
                        <span style={{ width: 30, textAlign: 'center', fontSize: p.pos <= 3 ? 17 : 12.5, fontWeight: 900,
                          color: p.pos <= 3 ? undefined : 'var(--muted)' }}>
                          {MEDALHA[p.pos] || `${p.pos}º`}
                        </span>
                        <Avatar p={p} tam={34} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontWeight: 800, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.nome}{p.voce && <span style={{ color: 'var(--tq2)' }}> · você</span>}
                            </span>
                            <span style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                              {p.hoje > 0 && <b style={{ color: 'var(--ok,#16a34a)' }}>+{p.hoje} hoje · </b>}
                              <b style={{ color: 'var(--txt)' }}>{p.n}</b> no período
                            </span>
                          </div>
                          <div style={{ height: 7, borderRadius: 5, background: 'var(--bg2)', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.max(pct, p.n > 0 ? 4 : 0)}%`, height: '100%', borderRadius: 5,
                              background: p.pos === 1 ? 'linear-gradient(90deg,#f59e0b,#fcd34d)' : info.cor,
                              transition: 'width .7s' }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                </div>
              </>
            )}
          </div>
        );
      })}

      <div style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>
        Conta toda venda registrada no período — inclusive sinal e parcelado. Empate divide a mesma posição.
        {user?.role === 'master' && ' · Como master, você vê o pódio de todos os setores.'}
      </div>
    </div>
  );
}
