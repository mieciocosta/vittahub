import React, { useEffect, useState } from 'react';
import { Gamepad2, Check, X, Trophy, Sparkles, ChevronRight, RotateCcw, Medal } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';

/* QUIZ DIÁRIO DE VENDAS — cada dia um quiz de perguntas e respostas sobre vendas
   no contexto do setor. Pontuação, confete ao ir bem. Aprender vendendo. 🎯 */

const CORES = ['#00B8C0', '#0E8C96', '#C4973B', '#0fb07a', '#3b82f6', '#ec4899', '#f59e0b'];
function Confetes() {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1300, overflow: 'hidden' }}>
      {Array.from({ length: 110 }).map((_, i) => {
        const left = Math.random() * 100, delay = Math.random() * 0.5, dur = 2.2 + Math.random() * 1.8;
        const size = 7 + Math.random() * 8, cor = CORES[i % CORES.length], rot = Math.random() * 360;
        return <span key={i} style={{ position: 'absolute', top: -20, left: `${left}%`, width: size, height: size * (Math.random() > 0.5 ? 1 : 0.45), background: cor, borderRadius: Math.random() > 0.6 ? '50%' : 2, transform: `rotate(${rot}deg)`, animation: `vh-confete ${dur}s ${delay}s cubic-bezier(.2,.6,.4,1) forwards` }} />;
      })}
      <style>{`@keyframes vh-confete { 0% { transform: translateY(0) rotate(0); opacity: 1; } 100% { transform: translateY(105vh) rotate(720deg); opacity: .6; } }`}</style>
    </div>
  );
}

export default function Quiz() {
  const api = useApi();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [idx, setIdx] = useState(0);
  const [respostas, setRespostas] = useState([]);
  const [resultado, setResultado] = useState(null); // { score, acertos, total, gabarito, respostas }
  const [enviando, setEnviando] = useState(false);
  const [festa, setFesta] = useState(false);
  const [ranking, setRanking] = useState([]);

  const load = () => {
    setCarregando(true); setErro('');
    api.get('/extras/quiz/hoje').then(d => {
      setData(d);
      if (d.jaRespondeu && d.resultado) setResultado(d.resultado);
    }).catch(e => setErro(e.message || 'Não consegui carregar o quiz.')).finally(() => setCarregando(false));
    api.get('/extras/quiz/ranking').then(setRanking).catch(() => {});
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const escolher = (opt) => {
    if (resultado) return;
    setRespostas(p => { const n = [...p]; n[idx] = opt; return n; });
  };
  const proxima = () => { if (idx < (data.total - 1)) setIdx(idx + 1); };
  const anterior = () => { if (idx > 0) setIdx(idx - 1); };

  const enviar = async () => {
    setEnviando(true); setErro('');
    try {
      const r = await api.post('/extras/quiz/responder', { respostas });
      setResultado(r);
      if (r.score >= 70) { setFesta(true); setTimeout(() => setFesta(false), 4500); }
      api.get('/extras/quiz/ranking').then(setRanking).catch(() => {});
    } catch (e) { setErro(e.message || 'Falha ao enviar.'); }
    setEnviando(false);
  };

  if (carregando) return <div style={{ padding: 40, color: 'var(--muted)' }}>Carregando o quiz de hoje…</div>;

  const total = data?.total || 0;
  const respondidas = respostas.filter(r => r != null).length;

  // Tela de resultado
  if (resultado) {
    const { score, acertos, total: tot, gabarito, respostas: minhas } = resultado;
    const faixa = score >= 90 ? { emoji: '🏆', txt: 'Fera de vendas!', cor: '#16a34a' } : score >= 70 ? { emoji: '🎉', txt: 'Muito bem!', cor: '#0891b2' } : score >= 50 ? { emoji: '💪', txt: 'Tá no caminho!', cor: '#d97706' } : { emoji: '📚', txt: 'Bora estudar mais!', cor: '#dc2626' };
    return (
      <div style={{ padding: 28, maxWidth: 780, margin: '0 auto' }}>
        {festa && <Confetes />}
        <div style={{ borderRadius: 20, padding: '26px', color: '#fff', textAlign: 'center', marginBottom: 20, background: `linear-gradient(135deg,${faixa.cor},${faixa.cor}cc)`, boxShadow: `0 12px 34px ${faixa.cor}55` }}>
          <div style={{ fontSize: 46 }}>{faixa.emoji}</div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>{faixa.txt}</div>
          <div style={{ fontSize: 44, fontWeight: 900, margin: '6px 0' }}>{score}%</div>
          <div style={{ fontSize: 14, opacity: .95 }}>Você acertou {acertos} de {tot} · {score >= 70 ? 'parabéns! 🎊' : 'amanhã tem mais pra melhorar!'}</div>
        </div>

        {/* Gabarito comentado */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {(data.perguntas || []).map((p, i) => {
            const certa = gabarito[i]?.correta, minha = minhas[i];
            const acertou = minha === certa;
            return (
              <div key={i} className="card" style={{ padding: '15px 17px', borderLeft: `4px solid ${acertou ? '#16a34a' : '#dc2626'}` }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={{ fontSize: 15 }}>{acertou ? '✅' : '❌'}</span>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{i + 1}. {p.q}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {p.opcoes.map((o, j) => {
                    const eCerta = j === certa, eMinha = j === minha;
                    return (
                      <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, padding: '5px 9px', borderRadius: 8,
                        background: eCerta ? '#e7f8ef' : eMinha ? '#fdecec' : 'transparent',
                        color: eCerta ? '#166534' : eMinha ? '#991b1b' : 'var(--txt2)', fontWeight: eCerta || eMinha ? 700 : 500 }}>
                        {eCerta ? <Check size={13} /> : eMinha ? <X size={13} /> : <span style={{ width: 13 }} />} {o}
                      </div>
                    );
                  })}
                </div>
                {gabarito[i]?.explicacao && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, fontStyle: 'italic' }}>💡 {gabarito[i].explicacao}</div>}
              </div>
            );
          })}
        </div>

        <RankingCard ranking={ranking} user={user} />
        <div style={{ marginTop: 14, textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>Volte amanhã pro próximo quiz! 📅</div>
      </div>
    );
  }

  // Erro sem quiz
  if (erro && !data) return (
    <div style={{ padding: 28, maxWidth: 620, margin: '0 auto' }}>
      <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
        <Gamepad2 size={34} color="var(--border)" style={{ marginBottom: 10 }} />
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{erro}</div>
        <button onClick={load} className="btn btn-p btn-sm" style={{ gap: 6, marginTop: 8 }}><RotateCcw size={13} /> Tentar de novo</button>
      </div>
    </div>
  );

  const p = data.perguntas[idx];
  return (
    <div style={{ padding: 28, maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ borderRadius: 18, padding: '20px 24px', marginBottom: 18, color: '#fff', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg,#7c3aed 0%,#4c1d95 60%,#3b0764 130%)', boxShadow: '0 10px 30px rgba(76,29,149,.3)' }}>
        <div style={{ position: 'absolute', right: -25, top: -25, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,.1)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 21, fontWeight: 800 }}><Gamepad2 size={23} /> Quiz de Vendas do Dia</div>
        <div style={{ fontSize: 13, opacity: .95, marginTop: 5 }}>Responda, pontue e afie suas vendas todo dia. Setor: <b style={{ textTransform: 'capitalize' }}>{data.setor}</b> 🎯</div>
      </div>

      {/* Progresso */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 16 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} onClick={() => setIdx(i)} style={{ flex: 1, height: 7, borderRadius: 4, cursor: 'pointer',
            background: i === idx ? 'var(--tq)' : respostas[i] != null ? 'var(--tq3)' : 'var(--bg2)' }} />
        ))}
      </div>

      {/* Pergunta */}
      <div className="card" style={{ padding: '22px 24px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--tq2)', marginBottom: 8 }}>PERGUNTA {idx + 1} DE {total}</div>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 18, lineHeight: 1.45 }}>{p.q}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {p.opcoes.map((o, j) => {
            const sel = respostas[idx] === j;
            return (
              <button key={j} onClick={() => escolher(j)} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: sel ? 700 : 500,
                background: sel ? 'var(--tq3)' : 'var(--bg2)', color: sel ? 'var(--tq2)' : 'var(--txt)', border: `2px solid ${sel ? 'var(--tq)' : 'transparent'}`, transition: 'all .12s' }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, background: sel ? 'var(--tq)' : 'var(--card)', color: sel ? '#fff' : 'var(--muted)' }}>{'ABCD'[j]}</span>
                {o}
              </button>
            );
          })}
        </div>
      </div>

      {/* Navegação */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 10 }}>
        <button onClick={anterior} disabled={idx === 0} className="btn btn-s btn-sm" style={{ opacity: idx === 0 ? .4 : 1 }}>Anterior</button>
        <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{respondidas}/{total} respondidas</span>
        {idx < total - 1 ? (
          <button onClick={proxima} className="btn btn-p btn-sm" style={{ gap: 5 }}>Próxima <ChevronRight size={14} /></button>
        ) : (
          <button onClick={enviar} disabled={enviando || respondidas < total} className="btn btn-p btn-sm" style={{ gap: 6, opacity: respondidas < total ? .5 : 1 }}>
            <Sparkles size={14} /> {enviando ? 'Corrigindo…' : 'Finalizar'}
          </button>
        )}
      </div>
      {respondidas < total && idx === total - 1 && <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Responda todas as perguntas pra finalizar.</div>}
      {erro && <div style={{ fontSize: 12.5, color: 'var(--err)', fontWeight: 600, marginTop: 10, textAlign: 'center' }}>{erro}</div>}
    </div>
  );
}

function RankingCard({ ranking, user }) {
  if (!ranking?.length) return null;
  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}><Medal size={16} color="#C4973B" /> Ranking de hoje</div>
      {ranking.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < ranking.length - 1 ? '1px solid var(--border)' : 'none', fontWeight: r.nome === user?.nome ? 800 : 500 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: i === 0 ? '#C4973B' : 'var(--muted)', minWidth: 22 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}</span>
          <span style={{ flex: 1, fontSize: 13 }}>{(r.nome || '—').split(' ').slice(0, 2).join(' ')}{r.nome === user?.nome ? ' (você)' : ''}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.acertos}/{r.total}</span>
          <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--tq2)' }}>{r.score}%</span>
        </div>
      ))}
    </div>
  );
}
