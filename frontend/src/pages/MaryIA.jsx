import React, { useEffect, useState } from 'react';
import { Bot, Zap, Users } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { Toast } from '../hooks/toast.js';

/* 🤖 MARY (IA) — a central de controle pedida pelo master:
   · chave GERAL (só ele): desliga a Mary pra clínica inteira de uma vez;
   · chave PESSOAL: cada usuária liga/desliga a Mary NAS PRÓPRIAS conversas,
     sem afetar as colegas ("não quero que isso crie conflito");
   · lista da equipe (só master): o estado de cada uma, com o toggle.
   O botão POR CONVERSA continua no Chat (faixa roxa) — aqui é o painel. */

const Chave = ({ on, onClick, tamanho = 46 }) => (
  <span onClick={onClick} style={{ width: tamanho, height: tamanho * 0.56, borderRadius: 20, flexShrink: 0, position: 'relative', cursor: 'pointer',
    background: on ? '#7c3aed' : 'var(--border)', transition: 'background .2s', display: 'inline-block' }}>
    <span style={{ position: 'absolute', top: 3, left: on ? tamanho - tamanho * 0.56 + 3 : 3, width: tamanho * 0.56 - 6, height: tamanho * 0.56 - 6,
      borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }} />
  </span>
);

export default function MaryIA() {
  const api = useApi();
  const { user } = useAuth();
  const master = user?.role === 'master';
  const podeVer = master || user?.ia_consultas === true;
  const [me, setMe] = useState(null);
  const [pausa, setPausa] = useState(null);
  const [equipe, setEquipe] = useState([]);
  const [conv, setConv] = useState(null);   // 📊 conversões da IA por semana
  const [funil, setFunil] = useState(null); // 🎯 onde a venda escapa (funil da IA)
  const [funilSetor, setFunilSetor] = useState('');
  useEffect(() => {
    if (!podeVer) return;
    api.get('/auth/me').then(setMe).catch(() => {});
    api.get('/inbox/automacao/pausa').then(setPausa).catch(() => {});
    if (master) api.get('/auth/ia-equipe').then(d => setEquipe(Array.isArray(d) ? d : [])).catch(() => {});
    if (master) api.get('/inbox/ia-conversao').then(setConv).catch(() => {});
    if (master) api.get('/inbox/ia-funil?dias=30').then(setFunil).catch(() => {});
  }, []); // eslint-disable-line

  if (!podeVer) return <div style={{ padding: 40, color: 'var(--muted)' }}>🔒 O painel da Mary é de quem tem o botão da IA.</div>;

  const geralOn = pausa?.ligado?.bot !== false;
  const minhaOn = me ? me.ia_ligada !== false : true;
  const trocarGeral = async () => {
    try {
      const d = await api.post('/inbox/automacao/pausa', { area: 'bot', ligado: !geralOn });
      setPausa(d);
      Toast.show(!geralOn ? 'Mary ligada pra clínica inteira! 🤖' : 'Mary DESLIGADA pra todo mundo — nada responde sozinho.', 'success');
    } catch (e) { Toast.show(e.message, 'error'); }
  };
  const trocarMinha = async () => {
    try {
      const d = await api.patch('/auth/me/ia', { ligada: !minhaOn });
      setMe(m => ({ ...m, ia_ligada: d.ia_ligada }));
      Toast.show(d.ia_ligada ? 'Mary ligada nas SUAS conversas! 💜' : 'Mary desligada só pra você — as colegas seguem normais.', 'success');
    } catch (e) { Toast.show(e.message, 'error'); }
  };
  const trocarDe = async (u2) => {
    try {
      const d = await api.put(`/auth/usuarios/${u2.id}`, { ia_ligada: !(u2.ia_ligada !== false) });
      setEquipe(p => p.map(x => x.id === u2.id ? { ...x, ia_ligada: d.ia_ligada } : x));
    } catch (e) { Toast.show(e.message, 'error'); }
  };

  return (
    <div style={{ padding: 28, maxWidth: 760, margin: '0 auto' }}>
      <div style={{ borderRadius: 18, padding: '22px 26px', marginBottom: 20, color: '#fff', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg,#4c1d95,#7c3aed 60%,#a855f7)', boxShadow: '0 10px 30px rgba(124,58,237,.35)' }}>
        <div style={{ position: 'absolute', right: -25, top: -25, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,.10)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 23, fontWeight: 800 }}><Bot size={26} /> Mary — a IA que atende</div>
        <div style={{ fontSize: 13.5, opacity: .95, marginTop: 6, maxWidth: 560, lineHeight: 1.5 }}>
          Treinada nos atendimentos que fecharam, ela conversa com o cliente <b>assinando o nome da atendente responsável</b> e conduz pelo protocolo das 7 etapas até o agendamento.
        </div>
      </div>

      {/* 🎯 FUNIL DA IA (pedido do master: "vamos trabalhar com a conversão").
          Mostra em que degrau a venda escapa — é o que a gente treina depois. */}
      {master && funil && funil.atendidas > 0 && (() => {
        const pct = (n) => funil.atendidas ? Math.round((n / funil.atendidas) * 100) : 0;
        const passos = [
          ['Conversas atendidas pela IA', funil.atendidas, '#7c3aed'],
          ['Clientes que responderam', funil.responderam, '#6366f1'],
          ['Receberam o investimento', funil.investimento, '#0ea5e9'],
          ['Receberam oferta de horário', funil.ofereceu_horario, '#14b8a6'],
          ['Agendaram', funil.agendaram, '#f59e0b'],
          ['Viraram venda', funil.venderam, '#16a34a'],
        ];
        // Maior queda entre degraus seguidos: é ali que o treino rende mais
        let pior = null;
        for (let i = 1; i < passos.length; i++) {
          const de = passos[i - 1][1] || 0, para = passos[i][1] || 0;
          const perda = de - para;
          if (de > 0 && (!pior || perda > pior.perda)) pior = { perda, de: passos[i - 1][0], para: passos[i][0] };
        }
        const trocar = (st) => { setFunilSetor(st); api.get(`/inbox/ia-funil?dias=30${st ? `&setor=${st}` : ''}`).then(setFunil).catch(() => {}); };
        return (
          <div className="card" style={{ padding: '17px 20px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>🎯 Máquina de vendas — funil da IA (30 dias)</div>
              {[['', 'Tudo'], ['consultas', '🩺'], ['terapias', '🧩'], ['vacinas', '💉']].map(([v, l]) => (
                <button key={v || 'all'} onClick={() => trocar(v)}
                  style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800, cursor: 'pointer',
                    border: `1.5px solid ${funilSetor === v ? 'var(--tq)' : 'var(--border)'}`,
                    background: funilSetor === v ? 'var(--tq3)' : 'var(--card)', color: funilSetor === v ? 'var(--tq2)' : 'var(--muted)' }}>{l}</button>
              ))}
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {passos.map(([rot, n, cor]) => (
                <div key={rot} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--txt2)', width: 190, flexShrink: 0 }}>{rot}</span>
                  <span style={{ flex: 1, height: 12, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${pct(n)}%`, background: cor, borderRadius: 99 }} />
                  </span>
                  <b style={{ fontSize: 12.5, width: 74, textAlign: 'right', flexShrink: 0 }}>{n} · {pct(n)}%</b>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 11, fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>
              {pior && pior.perda > 0 && (
                <>🔎 A maior queda está entre <b style={{ color: 'var(--txt2)' }}>{pior.de.toLowerCase()}</b> e <b style={{ color: 'var(--txt2)' }}>{pior.para.toLowerCase()}</b>: {pior.perda} cliente(s) ficaram pelo caminho. É esse degrau que vale treinar primeiro.<br /></>
              )}
              {funil.resposta_media_seg != null && (
                <>⏱️ A IA responde em média em <b style={{ color: 'var(--txt2)' }}>{funil.resposta_media_seg < 60 ? `${funil.resposta_media_seg}s` : `${Math.round(funil.resposta_media_seg / 60)} min`}</b>. Velocidade converte: acima de 5 minutos o cliente já foi olhar outra clínica.</>
              )}
            </div>
          </div>
        );
      })()}

      {/* Chave pessoal — de cada usuária, sem conflito */}
      <div className="card" style={{ padding: '17px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>💜 Mary nas MINHAS conversas</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginTop: 3 }}>
            Desligou aqui, a Mary silencia só nas conversas que são suas — <b>as das colegas continuam normais</b>.
            E em qualquer conversa você ainda liga/desliga pela faixa roxa do Chat.
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Chave on={minhaOn} onClick={trocarMinha} />
          <div style={{ fontSize: 10.5, fontWeight: 900, marginTop: 3, color: minhaOn ? '#7c3aed' : 'var(--err,#dc2626)' }}>{minhaOn ? 'LIGADA' : 'DESLIGADA'}</div>
        </div>
      </div>

      {/* Chave geral — só o master */}
      {master && (
        <div className="card" style={{ padding: '17px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, borderLeft: '4px solid #7c3aed' }}>
          <Zap size={20} color="#7c3aed" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>⚡ Chave GERAL (só você vê)</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginTop: 3 }}>
              Desliga a Mary pra <b>clínica inteira</b> de uma vez — nenhuma resposta automática sai, nem nas conversas ligadas na mão. As chaves pessoais ficam guardadas pra quando religar.
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Chave on={geralOn} onClick={trocarGeral} />
            <div style={{ fontSize: 10.5, fontWeight: 900, marginTop: 3, color: geralOn ? '#7c3aed' : 'var(--err,#dc2626)' }}>{geralOn ? 'LIGADA' : 'DESLIGADA'}</div>
          </div>
        </div>
      )}

      {/* 📊 A máquina em números — conversões da IA por semana (master) */}
      {master && conv?.semanas?.length > 0 && (
        <div className="card" style={{ padding: '17px 20px', marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>📊 Vendas da IA — últimas semanas</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 10 }}>
            Conversas em que a IA falou → que agendaram → que viraram venda (na mesma semana).
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ color: 'var(--muted)', fontSize: 10.5, textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Semana</th>
                <th style={{ padding: '4px 6px' }}>🤖 Atendidas</th>
                <th style={{ padding: '4px 6px' }}>📅 Agendaram</th>
                <th style={{ padding: '4px 6px' }}>💰 Venderam</th>
                <th style={{ padding: '4px 6px' }}>Conversão</th>
              </tr></thead>
              <tbody>
                {conv.semanas.map((sm, i) => {
                  const tx = sm.atendidas > 0 ? Math.round((sm.agendadas / sm.atendidas) * 100) : 0;
                  return (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px', fontWeight: 700 }}>{new Date(sm.ini).toLocaleDateString('pt-BR').slice(0, 5)} – {new Date(sm.fim).toLocaleDateString('pt-BR').slice(0, 5)}{i === 0 ? ' (atual)' : ''}</td>
                      <td style={{ padding: '6px', textAlign: 'center', fontWeight: 800 }}>{sm.atendidas}</td>
                      <td style={{ padding: '6px', textAlign: 'center', fontWeight: 800, color: '#0ea5e9' }}>{sm.agendadas}</td>
                      <td style={{ padding: '6px', textAlign: 'center', fontWeight: 800, color: 'var(--ok,#16a34a)' }}>{sm.vendas}</td>
                      <td style={{ padding: '6px', textAlign: 'center', fontWeight: 900, color: tx >= 30 ? 'var(--ok,#16a34a)' : tx >= 10 ? '#d97706' : 'var(--muted)' }}>{tx}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Equipe da Mary — só o master */}
      {master && (
        <div className="card" style={{ padding: '17px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, marginBottom: 4 }}>
            <Users size={16} color="#7c3aed" /> Quem tem o botão da Mary
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 10 }}>
            Cada chave abaixo é INDEPENDENTE — desligar uma não mexe nas outras. Pra dar ou tirar o botão de alguém: Configurações → Usuários.
          </div>
          {equipe.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Ninguém com o botão ainda.</div>}
          {equipe.map(u2 => {
            const on = u2.ia_ligada !== false;
            return (
              <div key={u2.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px dashed var(--border)' }}>
                <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                  {String(u2.nome || '?').trim()[0]?.toUpperCase()}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 800, fontSize: 13.5 }}>{u2.nome}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {(Array.isArray(u2.setores) && u2.setores.length ? u2.setores : [u2.setor]).filter(Boolean).join(' + ') || 'sem setor'} · a Mary assina "{String(u2.nome || '').split(' ')[0]}" nas conversas dela
                  </span>
                </span>
                <div style={{ textAlign: 'center' }}>
                  <Chave on={on} onClick={() => trocarDe(u2)} tamanho={40} />
                  <div style={{ fontSize: 9.5, fontWeight: 900, marginTop: 2, color: on ? '#7c3aed' : 'var(--err,#dc2626)' }}>{on ? 'LIGADA' : 'DESLIGADA'}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 18, padding: '13px 16px', borderRadius: 12, background: 'var(--tq4)', border: '1px solid var(--tq3)', fontSize: 12, color: 'var(--txt2)', lineHeight: 1.6 }}>
        💡 <b>Como a Mary decide responder:</b> chave geral ligada → chave pessoal da responsável ligada → botão da conversa ligado. Os três de acordo, ela trabalha.
        Se a atendente escrever na conversa, a Mary sai de cena ali na hora — sempre.
      </div>
    </div>
  );
}
