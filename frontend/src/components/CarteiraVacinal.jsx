import React, { useEffect, useState } from 'react';
import { Printer, CalendarPlus, Check, X } from 'lucide-react';
import { useApi } from '../context/AuthContext.jsx';
import { mensagemAgendamento } from '../hooks/celebra.js';

/* 💉 CARTEIRA VACINAL DO PACIENTE (0-18 meses e além)
   Mostra o esquema do bebê conforme o calendário cadastrado (espelho do
   Vittasys): o que já foi aplicado, o que está no ponto, o que atrasou e o
   que vem. Marca dose aplicada, imprime e agenda — do chat ou da Fidelidade. */

const ST = {
  aplicada:  ['✅ Aplicada',  '#16a34a', '#f0fdf4'],
  atrasada:  ['🔴 Atrasada',  '#dc2626', '#fef2f2'],
  no_ponto:  ['🟢 No ponto',  '#0E8C96', '#ecfeff'],
  chegando:  ['🔵 Chegando',  '#2563eb', '#eff6ff'],
  futura:    ['⚪ Futura',    '#94a3b8', 'transparent'],
};
const fmtBR = (d) => (d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—');

export default function CarteiraVacinal({ convId, onAgendar, compacto = false }) {
  const api = useApi();
  const [dados, setDados] = useState(null);
  const [salvando, setSalvando] = useState(null);
  const [agenda, setAgenda] = useState(null);   // 📅 agendamento da etapa

  // Sugere a data: a prevista, se ainda vier; senão, daqui a 3 dias úteis
  const sugerirData = (m) => {
    const hoje = new Date();
    const prev = m.previsao ? new Date(m.previsao + 'T12:00:00') : null;
    const base = prev && prev > hoje ? prev : new Date(hoje.getTime() + 3 * 86400000);
    if (base.getDay() === 0) base.setDate(base.getDate() + 1);   // domingo não
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
  };
  const abrirAgenda = (m) => setAgenda({
    etapa: m.nome, marco_mes: m.mes, data: sugerirData(m), hora: '09:00',
    vacinas: m.doses.filter(d => !d.aplicada).map(d => d.vacina),
    todas: m.doses.map(d => d.vacina),
  });
  const confirmarAgenda = async () => {
    if (!agenda.vacinas.length) return window.alert('Selecione ao menos uma vacina.');
    setSalvando('agenda');
    try {
      const r = await api.post(`/inbox/conversations/${convId}/carteira/agendar`, {
        etapa: agenda.etapa, data: agenda.data, hora: agenda.hora, vacinas: agenda.vacinas, paciente: dados?.paciente,
      });
      setAgenda(null);
      window.alert(`✅ Agendado para ${agenda.data.split('-').reverse().join('/')} às ${agenda.hora}!\n\n${r.doses} dose(s) já solicitadas ao estoque.\n\n${mensagemAgendamento()}`);
      await carregar();
    } catch (e) { window.alert('Erro: ' + e.message); }
    setSalvando(null);
  };

  const carregar = () => api.get(`/inbox/conversations/${convId}/carteira`).then(setDados).catch(() => setDados({ erro: true }));
  useEffect(() => { setDados(null); carregar(); }, [convId]); // eslint-disable-line

  // Marca UMA dose específica (dose a dose)
  const marcarDose = async (m, d) => {
    setSalvando(`${m.mes}|${d.vacina}`);
    try {
      await api.post(`/inbox/conversations/${convId}/carteira`, { marco_mes: m.mes, vacina: d.vacina, aplicada: !d.aplicada });
      await carregar();
    } catch (e) { window.alert('Erro: ' + e.message); }
    setSalvando(null);
  };
  // Marca/desmarca TODAS as doses do marco de uma vez
  const marcarMarco = async (m) => {
    const aplicando = m.aplicadas < m.total_doses;
    setSalvando(`todas-${m.mes}`);
    try {
      if (aplicando) {
        for (const d of m.doses) if (!d.aplicada) await api.post(`/inbox/conversations/${convId}/carteira`, { marco_mes: m.mes, vacina: d.vacina, aplicada: true });
      } else {
        await api.post(`/inbox/conversations/${convId}/carteira`, { marco_mes: m.mes, aplicada: false });
      }
      await carregar();
    } catch (e) { window.alert('Erro: ' + e.message); }
    setSalvando(null);
  };

  const imprimir = () => {
    if (!dados) return;
    const w = window.open('', '_blank'); if (!w) return;
    // Uma linha por DOSE (igual à tela), agrupada pela idade
    const linhas = dados.marcos.map(m => {
      const cls = m.status === 'aplicada' ? 'ok' : m.status === 'atrasada' ? 'atr' : m.status === 'parcial' ? 'par' : m.status === 'no_ponto' ? 'pto' : '';
      const situacao = m.status === 'aplicada' ? 'Aplicada'
        : m.status === 'parcial' ? `Parcial ${m.aplicadas}/${m.total_doses}`
        : m.status === 'atrasada' ? 'EM ATRASO'
        : m.status === 'no_ponto' ? 'Fazer agora'
        : m.status === 'chegando' ? 'Proxima' : 'Futura';
      const n = m.doses.length || 1;
      return m.doses.map((d, i) => `<tr class="${cls}">
        ${i === 0 ? `<td class="idade" rowspan="${n}"><b>${m.nome}</b></td>` : ''}
        <td>${d.aplicada ? '&#10003; ' : '&#9744; '}${d.vacina}</td>
        ${i === 0 ? `<td class="c" rowspan="${n}">${m.previsao ? fmtBR(m.previsao) : '-'}</td>` : ''}
        <td class="c">${d.aplicada ? (d.aplicada_em ? fmtBR(d.aplicada_em) : 'OK') : ''}</td>
        <td class="c lote"></td>
        ${i === 0 ? `<td class="c sit" rowspan="${n}">${situacao}</td>` : ''}</tr>`).join('');
    }).join('');

    const r = dados.resumo || {};
    w.document.write(`<html><head><title>Carteira vacinal - ${dados.paciente || ''}</title><meta charset="utf-8">
      <style>
        @page { size: A4; margin: 12mm }
        *{box-sizing:border-box}
        body{font-family:Arial,Helvetica,sans-serif;color:#14202b;margin:0}
        .topo{display:flex;align-items:center;gap:14px;border-bottom:3px solid #0E8C96;padding-bottom:10px;margin-bottom:14px}
        .topo img{height:52px}
        .topo h1{margin:0;font-size:19px;color:#0E8C96}
        .topo .t2{font-size:11.5px;color:#64748b;margin-top:2px}
        .ficha{display:flex;flex-wrap:wrap;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;margin-bottom:14px}
        .ficha div{flex:1;min-width:150px;padding:8px 12px;border-right:1px solid #e2e8f0}
        .ficha div:last-child{border-right:none}
        .ficha span{display:block;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#64748b;font-weight:bold}
        .ficha b{font-size:13px}
        .resumo{display:flex;gap:8px;margin-bottom:12px;font-size:11px}
        .resumo i{font-style:normal;padding:4px 11px;border-radius:20px;border:1px solid #cbd5e1;font-weight:bold}
        .resumo .a{background:#f0fdf4;border-color:#86efac;color:#15803d}
        .resumo .b{background:#fef2f2;border-color:#fca5a5;color:#b91c1c}
        table{width:100%;border-collapse:collapse;font-size:11.5px}
        th{background:#0E8C96;color:#fff;padding:7px 8px;text-align:left;font-size:10.5px}
        td{border:1px solid #dbe3ea;padding:7px 8px}
        td.c{text-align:center}
        td.idade{white-space:nowrap;background:#f8fafc}
        td.sit{font-weight:bold;font-size:10.5px}
        tr.ok td{color:#64748b} tr.ok td.sit{color:#15803d}
        tr.atr td{background:#fff5f5} tr.atr td.sit{color:#b91c1c}
        tr.pto td.sit{color:#0E8C96}
        tr.par td{background:#fffbeb} tr.par td.sit{color:#b45309}
        .legenda{margin-top:12px;font-size:10px;color:#64748b}
        .rod{margin-top:16px;border-top:1px solid #dbe3ea;padding-top:9px;font-size:9.5px;color:#94a3b8;display:flex;justify-content:space-between}
      </style></head><body>
      <div class="topo">
        <img src="/logos/logo-h-color.png" onerror="this.style.display='none'"/>
        <div><h1>Carteira de Vacinacao</h1>
        <div class="t2">Vittalis Saude &middot; Pediatria e Vacinacao &middot; Sao Luis/MA</div></div>
      </div>
      <div class="ficha">
        <div><span>Paciente</span><b>${dados.paciente || '-'}</b></div>
        <div><span>Nascimento</span><b>${dados.nascimento ? fmtBR(dados.nascimento) : '-'}</b></div>
        <div><span>Idade atual</span><b>${dados.idade_meses != null ? `${dados.idade_meses} meses` : '-'}</b></div>
        <div><span>Responsavel</span><b>${dados.responsavel || '-'}</b></div>
        <div><span>Contato</span><b>${dados.telefone || '-'}</b></div>
      </div>
      <div class="resumo">
        <i class="a">${r.aplicadas || 0} de ${r.total || 0} doses aplicadas</i><i>${r.etapas_aplicadas || 0}/${r.etapas_total || 0} etapas completas</i>
        ${r.atrasadas ? `<i class="b">${r.atrasadas} em atraso</i>` : ''}
      </div>
      <table><thead><tr>
        <th style="width:78px">IDADE</th><th>DOSE / VACINA</th>
        <th style="width:78px" class="c">PREVISTO</th><th style="width:82px" class="c">APLICADA</th>
        <th style="width:78px" class="c">LOTE</th><th style="width:82px" class="c">SITUACAO</th>
      </tr></thead><tbody>${linhas}</tbody></table>
      <div class="legenda">Preencha o campo LOTE no ato da aplicacao. Esquema conforme o calendario da rede privada cadastrado no sistema.</div>
      <div class="rod"><span>Vittalis Saude - cuidando de quem voce mais ama</span><span>Emitida em ${new Date().toLocaleString('pt-BR')}</span></div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };


  if (!dados) return <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: '8px 0' }}>Carregando carteira vacinal…</div>;
  if (dados.erro) return <div style={{ fontSize: 12.5, color: 'var(--err)' }}>Não consegui carregar a carteira.</div>;

  return (
    <div>
      {/* Cabeçalho: bebê + resumo + ações */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 170 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--muted)' }}>💉 Carteira vacinal</div>
          <div style={{ fontSize: 14.5, fontWeight: 800, lineHeight: 1.3 }}>{dados.paciente || '— sem nome cadastrado —'}</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {dados.nascimento ? `${dados.idade_meses} meses · nasceu ${fmtBR(dados.nascimento)}` : '⚠️ cadastre a data de nascimento pra montar o esquema'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {dados.resumo.atrasadas > 0 && (
            <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 800 }}>
              {dados.resumo.atrasadas} atrasada{dados.resumo.atrasadas > 1 ? 's' : ''}
            </span>
          )}
          <span style={{ background: 'var(--bg2)', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 800, color: 'var(--txt2)' }}>
            {dados.resumo.aplicadas}/{dados.resumo.total} doses aplicadas
          </span>
          <button onClick={imprimir} title="Imprimir a carteira" className="btn btn-sm" style={{ gap: 5, fontWeight: 700, padding: '5px 10px' }}>
            <Printer size={12} /> Imprimir
          </button>
        </div>
      </div>

      {/* 📅 PRÓXIMA ETAPA — o que agendar agora (foco do controle mensal) */}
      {(() => {
        const prox = dados.marcos.find(m => ['atrasada', 'parcial', 'no_ponto'].includes(m.status))
          || dados.marcos.find(m => m.status === 'chegando');
        if (!prox) return (
          <div style={{ padding: '9px 12px', borderRadius: 11, background: '#f0fdf4', border: '1px solid #86efac', fontSize: 12.5, fontWeight: 700, color: '#15803d', marginBottom: 10 }}>
            🏆 Esquema em dia! Nenhuma dose pendente no momento.
          </div>
        );
        const atras = prox.status === 'atrasada';
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 13px', borderRadius: 12, marginBottom: 10,
            background: atras ? '#fef2f2' : '#ecfeff', border: `1.5px solid ${atras ? '#fca5a5' : '#67e8f9'}` }}>
            <span style={{ fontSize: 17 }}>{atras ? '🔴' : '📅'}</span>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase', color: atras ? '#b91c1c' : '#0E8C96' }}>
                {atras ? 'Dose em atraso — agendar já' : 'Próxima etapa a agendar'}
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>{prox.nome}{prox.previsao ? ` · previsto ${fmtBR(prox.previsao)}` : ''}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{prox.doses.filter(d => !d.aplicada).map(d => d.vacina).join(', ')}</div>
            </div>
            <button onClick={() => abrirAgenda(prox)} className="btn btn-p btn-sm" style={{ gap: 5, fontWeight: 800, background: atras ? '#dc2626' : undefined, border: 'none' }}>
              <CalendarPlus size={13} /> Agendar
            </button>
          </div>
        );
      })()}

      {/* Linha do tempo do esquema */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: compacto ? 260 : 'none', overflowY: compacto ? 'auto' : 'visible' }}>
        {dados.marcos.map(m => {
          const st = ST[m.status] || ST.futura;
          const parcial = m.status === 'parcial';
          return (
            <div key={m.mes} style={{ borderRadius: 11, background: parcial ? '#fffbeb' : st[2], border: `1px solid ${m.status === 'futura' ? 'var(--border)' : (parcial ? '#fcd34d' : st[1] + '44')}`, overflow: 'hidden' }}>
              {/* Cabeçalho do marco: idade, previsão e marcar tudo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px' }}>
                <button onClick={() => marcarMarco(m)} disabled={!!salvando} title={m.aplicadas === m.total_doses ? 'Desmarcar todas' : 'Marcar todas as doses desta etapa'}
                  style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontSize: 11, fontWeight: 900,
                    border: `2px solid ${m.aplicadas === m.total_doses && m.total_doses ? '#16a34a' : parcial ? '#d97706' : 'var(--border)'}`,
                    background: m.aplicadas === m.total_doses && m.total_doses ? '#16a34a' : parcial ? '#fde68a' : 'var(--card)',
                    color: parcial ? '#92400e' : '#fff' }}>
                  {m.aplicadas === m.total_doses && m.total_doses ? <Check size={13} strokeWidth={3} /> : parcial ? '–' : ''}
                </button>
                <div style={{ minWidth: 74 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: parcial ? '#b45309' : st[1] }}>{m.nome}</div>
                  {m.previsao && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtBR(m.previsao)}</div>}
                </div>
                <span style={{ flex: 1, fontSize: 10.5, fontWeight: 800, color: parcial ? '#b45309' : st[1] }}>
                  {parcial ? `🟡 Parcial · ${m.aplicadas}/${m.total_doses}` : st[0]}
                  {m.total_doses > 1 && !parcial ? ` · ${m.aplicadas}/${m.total_doses}` : ''}
                </span>
                {['atrasada', 'no_ponto', 'chegando', 'parcial', 'futura'].includes(m.status) && (
                  <button onClick={() => abrirAgenda(m)} title="Agendar esta etapa" className="btn btn-sm"
                    style={{ gap: 4, padding: '3px 9px', fontSize: 10.5, fontWeight: 800, background: parcial ? '#d97706' : st[1], color: '#fff', border: 'none', whiteSpace: 'nowrap' }}>
                    <CalendarPlus size={11} /> Agendar
                  </button>
                )}
              </div>

              {/* DOSE A DOSE: cada vacina com o seu próprio check */}
              <div style={{ background: 'var(--card)', borderTop: '1px solid var(--border)' }}>
                {m.doses.map(d => (
                  <div key={d.vacina} onClick={() => marcarDose(m, d)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px 5px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', opacity: salvando === `${m.mes}|${d.vacina}` ? .5 : 1 }}>
                    <span style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `2px solid ${d.aplicada ? '#16a34a' : 'var(--border)'}`, background: d.aplicada ? '#16a34a' : 'transparent', color: '#fff' }}>
                      {d.aplicada && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: d.aplicada ? 'var(--muted)' : 'var(--txt)', textDecoration: d.aplicada ? 'line-through' : 'none' }}>
                      {d.vacina}
                    </span>
                    {d.aplicada && (
                      <span style={{ fontSize: 9.5, color: '#16a34a', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {d.aplicada_em ? fmtBR(d.aplicada_em) : 'aplicada'}{d.registrado_por ? ` · ${String(d.registrado_por).split(' ')[0]}` : ''}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 📅 Modal: agendar a etapa (cria o horário E solicita as doses) */}
      {agenda && (
        <div onClick={e => e.target === e.currentTarget && setAgenda(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(3,43,48,.55)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 420, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>📅 Agendar {agenda.etapa}</span>
              <button onClick={() => setAgenda(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 12 }}>
              {dados.paciente || 'Paciente'} · o horário entra na Agenda e as doses são solicitadas ao estoque.
            </div>

            <div style={{ display: 'flex', gap: 9, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Data</label>
                <input type="date" value={agenda.data} onChange={e => setAgenda({ ...agenda, data: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--card)', color: 'var(--txt)', boxSizing: 'border-box', marginTop: 3 }} />
              </div>
              <div style={{ width: 108 }}>
                <label style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Hora</label>
                <input type="time" value={agenda.hora} onChange={e => setAgenda({ ...agenda, hora: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--card)', color: 'var(--txt)', boxSizing: 'border-box', marginTop: 3 }} />
              </div>
            </div>

            <label style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Doses deste atendimento</label>
            <div style={{ marginTop: 5, marginBottom: 14 }}>
              {agenda.todas.map(v => {
                const on = agenda.vacinas.includes(v);
                return (
                  <div key={v} onClick={() => setAgenda(a => ({ ...a, vacinas: on ? a.vacinas.filter(x => x !== v) : [...a.vacinas, v] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 9, cursor: 'pointer', background: on ? 'var(--tq4,#e8f7f8)' : 'transparent' }}>
                    <span style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `2px solid ${on ? 'var(--tq,#00B8C0)' : 'var(--border)'}`, background: on ? 'var(--tq,#00B8C0)' : 'transparent', color: '#fff' }}>
                      {on && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span style={{ fontSize: 12.5 }}>{v}</span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setAgenda(null)} className="btn btn-s">Cancelar</button>
              <button onClick={confirmarAgenda} disabled={salvando === 'agenda'} className="btn btn-p" style={{ fontWeight: 800 }}>
                {salvando === 'agenda' ? 'Agendando…' : `Agendar ${agenda.vacinas.length} dose(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
